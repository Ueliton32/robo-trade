// Circuit breakers de risco (Fase 8, 04/09/2026) — proteções automáticas,
// mas SÓ na direção conservadora: o único efeito possível de qualquer
// função aqui é IMPEDIR sinal novo de ser gerado. Nada aqui abre posição,
// aumenta alavancagem, fecha sinal pendente, ou ajusta um limite sozinho.
// Ver lib/risk-limits.ts pros valores configuráveis.
//
// Dois tipos de proteção, com comportamento diferente de propósito:
//
// 1) Breakers de estado persistido (RiskCircuitBreaker no banco):
//    daily_loss, weekly_loss, max_drawdown, loss_streak, api_failures.
//    Indicam que algo pode estar sistematicamente errado, não só uma
//    oscilação normal. Uma vez disparado, FICA disparado até reset manual
//    explícito (scripts/reset-circuit-breaker.ts) — nunca se destrava
//    sozinho, nem à meia-noite, nem quando a métrica volta a ficar OK no
//    próximo ciclo. Isso é proposital: "voltou a ficar OK por um
//    ciclo" não é evidência de que o problema foi resolvido.
//
// 2) Limites de exposição (sinais PENDENTE simultâneos por par / total):
//    são estruturais, não indicam nada de errado, e se autocorrigem
//    conforme sinal pendente fecha. Não precisam de reset manual — são só
//    um filtro aplicado a cada rodada de geração.
//
// "condições anormais de mercado" e "slippage acima do limite" (citados
// no pedido original) ficam DE FORA de propósito: o robô não executa
// ordem real, então não existe slippage real pra medir; e "anormal" pro
// mercado como um todo já tem uma aproximação em lib/regime.ts
// (ALTA_VOLATILIDADE_SEM_DIRECAO) que seria redundante duplicar aqui sem
// um critério mais específico. Ambos ficam como possível extensão futura,
// documentados em vez de meio-implementados.
import { prisma } from './prisma';
import { logPilotEvent } from './pilot-log';
import { notifyOps } from './ops-notify';
import { computeExtendedMetrics, signalRowToEvaluationTrade, EvaluationTrade } from './metrics-extended';
import { ROUNDTRIP_FEES_PERCENT, ASSUMED_SLIPPAGE_PERCENT } from './trading-costs';
import { CONSECUTIVE_FAILURES_STATE_KEY } from './system-state-keys';
import { getGlobalPairStrategyPlan, isComboActive, PairStrategyPlan } from './pair-strategy-plan';
import {
  RISK_MAX_DAILY_LOSS_PERCENT,
  RISK_MAX_WEEKLY_LOSS_PERCENT,
  RISK_MAX_DRAWDOWN_PERCENT,
  RISK_MAX_DRAWDOWN_LOOKBACK_DAYS,
  RISK_MAX_CONSECUTIVE_LOSSES,
  RISK_MAX_CONSECUTIVE_CYCLE_FAILURES,
  RISK_MAX_OPEN_SIGNALS_PER_PAIR,
  RISK_MAX_OPEN_SIGNALS_TOTAL,
  RISK_MAX_LEVERAGE_CAP,
} from './risk-limits';

export const BREAKER_KEYS = ['daily_loss', 'weekly_loss', 'max_drawdown', 'loss_streak', 'api_failures'] as const;
export type BreakerKey = (typeof BREAKER_KEYS)[number];

interface BreakerCheck {
  key: BreakerKey;
  breached: boolean;
  reason: string;
  metricValue: number;
  threshold: number;
}

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function loadLiveClosedSince(since: Date): Promise<EvaluationTrade[]> {
  const signals = await prisma.signal.findMany({
    where: { source: 'live', status: { in: ['WIN', 'LOSS'] }, closedAt: { gte: since } },
    orderBy: { closedAt: 'asc' },
  });
  return signals.map(signalRowToEvaluationTrade);
}

function sumNetPnl(trades: EvaluationTrade[]): number {
  return trades.reduce((sum, t) => {
    const net = t.pnlNetPercent ?? (t.pnlPercent ?? 0) - ROUNDTRIP_FEES_PERCENT - ASSUMED_SLIPPAGE_PERCENT;
    return sum + net;
  }, 0);
}

/**
 * Achado em produção (07-08/09/2026): um reset manual de um breaker
 * "esquece" sozinho no ciclo seguinte se a condição bruta continuar
 * batendo — porque cada check recalcula do zero a cada chamada, sem saber
 * que já foi resetado (ver evaluateCircuitBreakers). Aconteceu duas vezes:
 *
 * 1) max_drawdown (07/09): a estratégia Pullback na EMA20 foi removida de
 *    quase todos os pares, mas os sinais perdedores dela continuavam
 *    dentro da janela de 90 dias e mantinham o drawdown acima do limite
 *    indefinidamente — resetar não ajudava, e esperar a janela de 90 dias
 *    "esquecer" sozinha significava ~3 meses de robô pausado por uma
 *    causa já corrigida.
 * 2) daily_loss (08/09): HYPEUSDT foi removido de monitoredPairs por
 *    performance ruim, mas as perdas dele já fechadas HOJE continuavam
 *    contando pro total do dia — resetar re-disparava na hora. Aqui a
 *    decisão original deste arquivo (comentário abaixo, agora corrigido)
 *    tinha sido NÃO aplicar o mesmo filtro, com a suposição de que uma
 *    janela curta "se autocorrige sozinha" — o que é verdade pro dia
 *    SEGUINTE (a janela rola pra frente à meia-noite UTC), mas não ajuda
 *    quem quer destravar HOJE, no mesmo dia da perda. Suposição errada na
 *    prática, corrigida depois de acontecer de verdade em produção.
 *
 * Correção (aplicada a max_drawdown, daily_loss e weekly_loss): o cálculo
 * só considera sinais de combinações (par + estratégia) que ainda estão
 * ATIVAS na configuração de hoje (união de todos os usuários, igual ao que
 * generateSignals() realmente roda — ver lib/pair-strategy-plan.ts). Desde
 * 11/10/2026 "ativa" também exclui a DIREÇÃO bloqueada pelo gate de direção
 * (ex: SHORT da #1) — ver isComboActive.
 * Histórico de uma combinação desativada não desaparece do banco nem das
 * quebras de scripts/evaluate.ts, só para de contar pra estas proteções
 * especificamente — o raciocínio é que uma causa já removida da
 * configuração ao vivo não deveria continuar bloqueando geração de sinal
 * novo (nem por meses, nem pelo resto do dia).
 *
 * Trade-off consciente, não só técnico: isso enfraquece um pouco o
 * propósito de daily_loss/weekly_loss — se par ou estratégia perdedora
 * for removido toda vez que perde, na prática esses dois breakers só
 * travam por perda de algo que CONTINUA ativo, nunca mais por "o dia foi
 * ruim no geral". Decisão consciente do usuário (08/09/2026) — cada caso
 * de reset continua exigindo uma nota manual explicando o motivo.
 *
 * loss_streak também passou a usar o mesmo filtro (08/09/2026, ver
 * checkLossStreak) depois de acontecer na prática: 3 das 8 perdas
 * "seguidas" que dispararam eram do HYPEUSDT, já removido. A suposição
 * original aqui ("se autocorrige com um WIN novo") era verdade em teoria,
 * mas não impede histórico de combinação desativada de ocupar vagas na
 * contagem por dias, até um WIN de verdade empurrar ela pra fora da
 * janela. api_failures não foi mexido — não depende de par/estratégia.
 */
async function filterTradesToActiveCombos(trades: EvaluationTrade[]): Promise<EvaluationTrade[]> {
  const plan = await getGlobalPairStrategyPlan();
  return trades.filter((t) => isComboActive(plan, t.pair, t.strategyId, t.direction));
}

async function checkDailyLoss(): Promise<BreakerCheck> {
  const allTrades = await loadLiveClosedSince(startOfTodayUTC());
  const trades = await filterTradesToActiveCombos(allTrades);
  const excludedCount = allTrades.length - trades.length;
  const net = sumNetPnl(trades);
  const threshold = -RISK_MAX_DAILY_LOSS_PERCENT;
  return {
    key: 'daily_loss',
    breached: trades.length > 0 && net <= threshold,
    reason: `PnL líquido de hoje (desde 00:00 UTC), só combinações par/estratégia ainda ativas: ${net.toFixed(2)}% <= limite de ${threshold.toFixed(2)}% (${trades.length} sinal(is) fechado(s) hoje${excludedCount > 0 ? `, ${excludedCount} excluído(s) por serem de combinação já desativada` : ''})`,
    metricValue: net,
    threshold,
  };
}

async function checkWeeklyLoss(): Promise<BreakerCheck> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const allTrades = await loadLiveClosedSince(since);
  const trades = await filterTradesToActiveCombos(allTrades);
  const excludedCount = allTrades.length - trades.length;
  const net = sumNetPnl(trades);
  const threshold = -RISK_MAX_WEEKLY_LOSS_PERCENT;
  return {
    key: 'weekly_loss',
    breached: trades.length > 0 && net <= threshold,
    reason: `PnL líquido dos últimos 7 dias, só combinações par/estratégia ainda ativas: ${net.toFixed(2)}% <= limite de ${threshold.toFixed(2)}% (${trades.length} sinal(is)${excludedCount > 0 ? `, ${excludedCount} excluído(s) por serem de combinação já desativada` : ''})`,
    metricValue: net,
    threshold,
  };
}

async function checkMaxDrawdown(): Promise<BreakerCheck> {
  const since = new Date(Date.now() - RISK_MAX_DRAWDOWN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const allTrades = await loadLiveClosedSince(since);
  const trades = await filterTradesToActiveCombos(allTrades);
  const excludedCount = allTrades.length - trades.length;
  const metrics = computeExtendedMetrics(trades);
  const threshold = RISK_MAX_DRAWDOWN_PERCENT;
  return {
    key: 'max_drawdown',
    breached: trades.length > 0 && metrics.maxDrawdownNet >= threshold,
    reason: `Drawdown líquido máximo nos últimos ${RISK_MAX_DRAWDOWN_LOOKBACK_DAYS} dias, só combinações par/estratégia ainda ativas: ${metrics.maxDrawdownNet.toFixed(2)}% >= limite de ${threshold.toFixed(2)}% (${trades.length} sinal(is)${excludedCount > 0 ? `, ${excludedCount} excluído(s) por serem de combinação já desativada` : ''})`,
    metricValue: metrics.maxDrawdownNet,
    threshold,
  };
}

/**
 * Achado em produção (08/09/2026): mesma contaminação dos outros breakers
 * — 3 das 8 perdas "seguidas" que dispararam este eram do HYPEUSDT, já
 * removido de monitoredPairs. Decisão original deste arquivo (falava que
 * loss_streak "se autocorrige com um WIN novo") era verdade em teoria, mas
 * não evita que histórico de um par/estratégia já desativado ocupe vagas
 * na contagem das N últimas perdas até um WIN de verdade "empurrar" ele
 * pra fora da janela — o que pode levar dias. Corrigido com o mesmo
 * filtro dos outros três breakers.
 *
 * Segunda correção, 06/10/2026: a versão de 08/09 buscava um lote fixo (3x o
 * limite) e SÓ DEPOIS filtrava combinações inativas — quando o histórico
 * recente era dominado por uma estratégia desativada (ex: 28/09, #3), sobravam
 * poucas linhas ativas e a sequência era SUBCONTADA (9 em vez de 11), então o
 * breaker podia deixar de disparar. Agora varre em lotes, já filtrando, até a
 * primeira vitória ativa (ou até o teto de segurança). Ordenação por
 * closedAt + id pra paginação determinística em fechamentos no mesmo candle.
 */
const LOSS_STREAK_BATCH = 100;
const LOSS_STREAK_MAX_ROWS = 2000; // teto de segurança contra varrer o histórico inteiro

export interface LossStreakRow {
  status: string;
  pair: string;
  strategyId: number;
  direction: string;
}

/**
 * Núcleo puro de checkLossStreak — recebe um lote já buscado e o plano
 * ativo, devolve quantas perdas seguidas tem NESSE lote (só combinações
 * ainda ativas, ver filterTradesToActiveCombos acima pro mesmo raciocínio)
 * e se bateu numa vitória (ou linha de combinação inativa ignorada não
 * conta nem pra manter nem pra parar a sequência). Extraído (23/10/2026)
 * pra poder testar essa lógica — que já causou 3 incidentes documentados
 * em produção — sem precisar de banco.
 */
export function countActiveLossStreakInBatch(
  batch: LossStreakRow[],
  plan: PairStrategyPlan
): { streak: number; ended: boolean } {
  let streak = 0;
  let ended = false;
  for (const s of batch) {
    if (!isComboActive(plan, s.pair, s.strategyId, s.direction)) continue;
    if (s.status === 'LOSS') streak++;
    else { ended = true; break; }
  }
  return { streak, ended };
}

export async function checkLossStreak(batchSize: number = LOSS_STREAK_BATCH): Promise<BreakerCheck> {
  const plan = await getGlobalPairStrategyPlan();
  let streak = 0;
  let ended = false;
  for (let skip = 0; !ended && skip < LOSS_STREAK_MAX_ROWS; skip += batchSize) {
    const batch = await prisma.signal.findMany({
      where: { source: 'live', status: { in: ['WIN', 'LOSS'] } },
      orderBy: [{ closedAt: 'desc' }, { id: 'asc' }],
      skip,
      take: batchSize,
      select: { status: true, pair: true, strategyId: true, direction: true },
    });
    if (!batch.length) break;
    const result = countActiveLossStreakInBatch(batch, plan);
    streak += result.streak;
    ended = result.ended;
  }
  const threshold = RISK_MAX_CONSECUTIVE_LOSSES;
  return {
    key: 'loss_streak',
    breached: streak >= threshold,
    reason: `${streak} perda(s) seguida(s) (entre todas as estratégias/pares ainda ativas) >= limite de ${threshold}`,
    metricValue: streak,
    threshold,
  };
}

async function checkApiFailures(): Promise<BreakerCheck> {
  const row = await prisma.systemState.findUnique({ where: { key: CONSECUTIVE_FAILURES_STATE_KEY } });
  const failures = parseInt(row?.value ?? '0', 10) || 0;
  const threshold = RISK_MAX_CONSECUTIVE_CYCLE_FAILURES;
  return {
    key: 'api_failures',
    breached: failures >= threshold,
    reason: `${failures} ciclo(s) do agendador seguido(s) com falha >= limite de ${threshold}`,
    metricValue: failures,
    threshold,
  };
}

/**
 * Avalia todos os breakers, persiste qualquer disparo NOVO (não reavalia
 * nem destrava um que já estava disparado) e retorna o estado ativo
 * completo. Chamado no início de generateSignals() — cobre agendador,
 * rota manual "Analisar Agora" e a rota de cron, porque todos passam por
 * ali. Tem efeito colateral (escreve no banco, pode notificar) de
 * propósito: é o único lugar que precisa reavaliar a condição bruta;
 * quem só quer saber "está pausado?" sem reavaliar usa
 * isSignalGenerationPaused() abaixo.
 */
export async function evaluateCircuitBreakers(): Promise<{ newlyTripped: BreakerCheck[]; activeReasons: string[] }> {
  const checks = await Promise.all([
    checkDailyLoss(),
    checkWeeklyLoss(),
    checkMaxDrawdown(),
    checkLossStreak(),
    checkApiFailures(),
  ]);

  const existing = await prisma.riskCircuitBreaker.findMany({
    where: { key: { in: [...BREAKER_KEYS] } },
  });
  const existingByKey = new Map(existing.map((r) => [r.key, r]));

  const activeReasons: string[] = [];
  const newlyTripped: BreakerCheck[] = [];

  for (const check of checks) {
    const current = existingByKey.get(check.key);
    const alreadyTripped = current?.tripped ?? false;

    if (check.breached && !alreadyTripped) {
      await prisma.riskCircuitBreaker.upsert({
        where: { key: check.key },
        update: {
          tripped: true,
          reason: check.reason,
          metricValue: check.metricValue,
          threshold: check.threshold,
          trippedAt: new Date(),
          resetAt: null,
          resetNote: null,
        },
        create: {
          key: check.key,
          tripped: true,
          reason: check.reason,
          metricValue: check.metricValue,
          threshold: check.threshold,
          trippedAt: new Date(),
        },
      });
      await logPilotEvent('CIRCUIT_BREAKER_TRIPPED' as any, `Circuit breaker "${check.key}" disparado: ${check.reason}`);
      await notifyOps(
        `🛑 <b>Circuit breaker disparado: ${check.key}</b>\n\n${check.reason}\n\n` +
        `Geração de sinal novo pausada em TODO o sistema até reset manual:\n` +
        `npm run risk:reset -- --key=${check.key} --note="motivo do reset"`
      );
      newlyTripped.push(check);
      activeReasons.push(check.reason);
    } else if (alreadyTripped) {
      activeReasons.push(`[já disparado] ${current!.reason ?? check.reason}`);
    }
  }

  return { newlyTripped, activeReasons };
}

/**
 * Leitura simples e sem efeito colateral do estado atual — não reavalia
 * as condições, só olha o que já está persistido. Útil pra uma rota de
 * status no dashboard, se quiser mostrar isso sem o custo de recalcular
 * tudo a cada carregamento de tela.
 */
export async function isSignalGenerationPaused(): Promise<{ paused: boolean; reasons: string[] }> {
  const active = await prisma.riskCircuitBreaker.findMany({ where: { tripped: true } });
  return { paused: active.length > 0, reasons: active.map((r) => `${r.key}: ${r.reason}`) };
}

export interface ExposureFilterResult<T> {
  allowed: T[];
  blockedTotal: boolean;
  blockedPairs: string[];
}

/**
 * Filtra combinações (estratégia×par×timeframe) candidatas a gerar sinal
 * novo pelos limites de exposição — NÃO precisa de reset manual, ver
 * comentário no topo do arquivo. Se o total de sinais pendentes já
 * estourou o teto, bloqueia geração inteira (retorna lista vazia).
 *
 * Por par, libera só o que ainda cabe até RISK_MAX_OPEN_SIGNALS_PER_PAIR
 * (nunca mais que isso, mesmo que várias estratégias achem sinal pro
 * mesmo par no mesmo ciclo). Quando `weightByStrategy` é passado (Fase 7 —
 * ver lib/strategy-weights.ts), as vagas restantes daquele par vão pra
 * estratégia de maior peso primeiro; sem pesos (ou todas empatadas em
 * 1.0, o padrão até o usuário rodar `npm run weights:recompute` pela
 * primeira vez), a ordem é a mesma de antes — o comportamento não muda
 * até o peso existir de verdade.
 */
/**
 * Núcleo puro de filterCombosByExposure — dado o que já está pendente por
 * par (já agregado em contagem) e o teto por par, decide quais combos
 * cabem e quais pares ficam bloqueados. Quando `weightByStrategy` é
 * passado, as vagas restantes do par vão pra estratégia de maior peso
 * primeiro. Extraído (23/10/2026) pra poder testar sem banco.
 */
export function allocateComboCapacity<T extends { pair: string; strategyId: number }>(
  combos: T[],
  pendingCountByPair: Map<string, number>,
  maxPerPair: number,
  weightByStrategy?: Map<number, number>
): { allowed: T[]; blockedPairs: string[] } {
  const byPair = new Map<string, T[]>();
  for (const c of combos) {
    if (!byPair.has(c.pair)) byPair.set(c.pair, []);
    byPair.get(c.pair)!.push(c);
  }

  const blockedPairs: string[] = [];
  const allowed: T[] = [];
  for (const [pair, group] of byPair) {
    const remaining = maxPerPair - (pendingCountByPair.get(pair) ?? 0);
    if (remaining <= 0) {
      blockedPairs.push(pair);
      continue;
    }
    const ordered = weightByStrategy
      ? [...group].sort((a, b) => (weightByStrategy.get(b.strategyId) ?? 1) - (weightByStrategy.get(a.strategyId) ?? 1))
      : group;
    const kept = ordered.slice(0, remaining);
    allowed.push(...kept);
    if (kept.length < group.length) blockedPairs.push(pair);
  }

  return { allowed, blockedPairs };
}

export async function filterCombosByExposure<T extends { pair: string; strategyId: number }>(
  combos: T[],
  weightByStrategy?: Map<number, number>
): Promise<ExposureFilterResult<T>> {
  const pending = await prisma.signal.findMany({
    where: { status: 'PENDENTE', source: 'live' },
    select: { pair: true },
  });

  if (pending.length >= RISK_MAX_OPEN_SIGNALS_TOTAL) {
    return { allowed: [], blockedTotal: true, blockedPairs: [] };
  }

  const countByPair = new Map<string, number>();
  for (const p of pending) countByPair.set(p.pair, (countByPair.get(p.pair) ?? 0) + 1);

  const { allowed, blockedPairs } = allocateComboCapacity(combos, countByPair, RISK_MAX_OPEN_SIGNALS_PER_PAIR, weightByStrategy);
  return { allowed, blockedTotal: false, blockedPairs };
}

/**
 * Teto absoluto de alavancagem sugerida — só pode REDUZIR o que
 * lib/strategies.ts já sugeriu, nunca aumentar. Formato esperado
 * "NxN-MxM" (ex: "5x-10x"); se vier em formato inesperado, devolve sem
 * mexer (melhor não travar a geração de sinal por causa disso).
 */
export function clampLeverageString(leverage: string, cap: number = RISK_MAX_LEVERAGE_CAP): string {
  const match = /^(\d+)x-(\d+)x$/.exec((leverage ?? '').trim());
  if (!match) return leverage;
  const min = parseInt(match[1], 10);
  const max = parseInt(match[2], 10);
  const clampedMax = Math.min(max, cap);
  const clampedMin = Math.min(min, clampedMax);
  if (clampedMax === max && clampedMin === min) return leverage;
  return `${clampedMin}x-${clampedMax}x`;
}
