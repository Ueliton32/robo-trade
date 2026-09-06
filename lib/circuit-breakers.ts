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

async function checkDailyLoss(): Promise<BreakerCheck> {
  const trades = await loadLiveClosedSince(startOfTodayUTC());
  const net = sumNetPnl(trades);
  const threshold = -RISK_MAX_DAILY_LOSS_PERCENT;
  return {
    key: 'daily_loss',
    breached: trades.length > 0 && net <= threshold,
    reason: `PnL líquido de hoje (desde 00:00 UTC): ${net.toFixed(2)}% <= limite de ${threshold.toFixed(2)}% (${trades.length} sinal(is) fechado(s) hoje)`,
    metricValue: net,
    threshold,
  };
}

async function checkWeeklyLoss(): Promise<BreakerCheck> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const trades = await loadLiveClosedSince(since);
  const net = sumNetPnl(trades);
  const threshold = -RISK_MAX_WEEKLY_LOSS_PERCENT;
  return {
    key: 'weekly_loss',
    breached: trades.length > 0 && net <= threshold,
    reason: `PnL líquido dos últimos 7 dias: ${net.toFixed(2)}% <= limite de ${threshold.toFixed(2)}% (${trades.length} sinal(is))`,
    metricValue: net,
    threshold,
  };
}

async function checkMaxDrawdown(): Promise<BreakerCheck> {
  const since = new Date(Date.now() - RISK_MAX_DRAWDOWN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const trades = await loadLiveClosedSince(since);
  const metrics = computeExtendedMetrics(trades);
  const threshold = RISK_MAX_DRAWDOWN_PERCENT;
  return {
    key: 'max_drawdown',
    breached: trades.length > 0 && metrics.maxDrawdownNet >= threshold,
    reason: `Drawdown líquido máximo nos últimos ${RISK_MAX_DRAWDOWN_LOOKBACK_DAYS} dias: ${metrics.maxDrawdownNet.toFixed(2)}% >= limite de ${threshold.toFixed(2)}% (${trades.length} sinal(is))`,
    metricValue: metrics.maxDrawdownNet,
    threshold,
  };
}

async function checkLossStreak(): Promise<BreakerCheck> {
  const recent = await prisma.signal.findMany({
    where: { source: 'live', status: { in: ['WIN', 'LOSS'] } },
    orderBy: { closedAt: 'desc' },
    take: RISK_MAX_CONSECUTIVE_LOSSES + 5,
    select: { status: true },
  });
  let streak = 0;
  for (const s of recent) {
    if (s.status === 'LOSS') streak++;
    else break;
  }
  const threshold = RISK_MAX_CONSECUTIVE_LOSSES;
  return {
    key: 'loss_streak',
    breached: streak >= threshold,
    reason: `${streak} perda(s) seguida(s) (entre todas as estratégias/pares) >= limite de ${threshold}`,
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

  const byPair = new Map<string, T[]>();
  for (const c of combos) {
    if (!byPair.has(c.pair)) byPair.set(c.pair, []);
    byPair.get(c.pair)!.push(c);
  }

  const blockedPairs: string[] = [];
  const allowed: T[] = [];
  for (const [pair, group] of byPair) {
    const remaining = RISK_MAX_OPEN_SIGNALS_PER_PAIR - (countByPair.get(pair) ?? 0);
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
