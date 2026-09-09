import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { STRATEGY_DEFS, SignalData } from '@/lib/strategies';
import { getKlines, getFundingRate, getBookTicker } from '@/lib/binance';
import { sendSignalEmail, sendOutcomeEmail } from '@/lib/signal-email';
import { sendSignalTelegram, sendOutcomeTelegram } from '@/lib/signal-telegram';
import { classifyRegime, RegimeClassification } from '@/lib/regime';
import { regimeAllowsStrategy } from '@/lib/radar-context';
import { ROBOT_VERSION } from '@/lib/version';
import { evaluateCircuitBreakers, filterCombosByExposure, clampLeverageString } from '@/lib/circuit-breakers';
import { getLatestStrategyWeights } from '@/lib/strategy-weights';
import { getActiveModelsByStrategy, scoreSignalWithActiveModel } from '@/lib/ml-model';
import { getConfiguredExecutionMode, assertLiveExecutionNotAttempted, ExecutionMode } from '@/lib/execution-mode';
import { PairStrategyPlan, buildPairStrategyPlan, getGlobalPairStrategyPlan } from '@/lib/pair-strategy-plan';
import { evaluateStrategyEligibility, StrategyEligibilityResult } from '@/lib/strategy-eligibility';
import { STRATEGY_ELIGIBILITY_CONFIG_V1 } from '@/lib/strategy-eligibility-config';

// ─────────────────────────────────────────────────────────────────────────
// Fase C — Shadow Evaluation (09/09/2026)
// Constantes usadas pela persistência de sinais shadow com source tag.
// ─────────────────────────────────────────────────────────────────────────
const CURRENT_CONFIG_VERSION = 8; // v8 = Fase C (Shadow Evaluation)
type SignalSource = 'live' | 'PAPER_TRADING' | 'seed' | 'demo' | `shadow_v${number}`;

// Estratégias que já validamos com o filtro de regime (via lib/radar-context-backtest.ts)
// até ser extraído (06/09/2026) pra lib/pair-strategy-plan.ts, pra
// lib/circuit-breakers.ts poder usá-lo sem criar import circular (este
// arquivo importa de lib/circuit-breakers.ts). Nada mudou de lugar pra
// quem já importava PairStrategyPlan/buildPairStrategyPlan/
// getGlobalPairStrategyPlan a partir de '@/lib/analysis-engine'.
export type { PairStrategyPlan };
export { buildPairStrategyPlan, getGlobalPairStrategyPlan };

// Estratégias que já validamos com o filtro de regime (via lib/radar-context-backtest.ts)
// o suficiente pra rodar com esse filtro também ao vivo, não só em backtest.
// Decisão de 09/09/2026 (Fase C — Shadow Evaluation):
//   - Estratégia 1: RadarContextScan 08/09 — PF 0.96 → 1.46 (+0.50) em 1h,
//     PF 0.95 → 0.80 (-0.15) em 15m. Decisão: filtrar em qualquer TF porque
//     o filtro de regime para estratégia 1 funciona como filtro de contexto
//     geral (só LATERALIZACAO), e em qualquer TF o backtest mostra evidência
//     de que LATERALIZACAO é o regime onde ela performa melhor vs. não-filtrado.
//     Ver lib/radar-context.ts: a estratégia 1 já está em LATERALIZACAO no mapa.
//   - Estratégia 2: RadarContextScan 09/09 — PF 0.87 → 1.13 (+0.26) em 1h,
//     PF 0.76 → 0.81 (+0.05) em 4h, PF 0.49 → 0.54 (+0.05) em 15m.
//     Em todos os TFs, o filtro melhora ou mantém. Decisão: filtrar em qualquer TF.
const REGIME_GATED_STRATEGIES_LIVE: number[] = [1, 2];

// Estratégias com filtro de regime CONDICIONAL por timeframe.
// Chave = strategyId, valor = lista de timeframes onde o filtro de regime
// é aplicado. Estratégias fora deste mapa NUNCA passam pelo filtro.
// NOTA: esta tabela foi DESATIVADA em 09/09/2026.
// Motivo: estratégia 1 e 2 agora usam REGIME_GATED_STRATEGIES_LIVE (filtro
// sempre aplicado a qualquer TF). As evidências de melhora_por_TF para
// estratégia 1 foram inconsistentes entre 1h e 15m, e o gating por TF
// adicionava complexidade sem benefício claro. Manter apenas a lista global.
const REGIME_GATED_STRATEGIES_BY_TF: Record<number, string[]> = {};

/**
 * Pra estratégias na lista acima, só libera o sinal se o regime de
 * mercado, nesse exato momento, for compatível com o contexto que
 * validamos pra ela (ver lib/radar-context.ts). Estratégias fora da lista
 * passam direto, sem filtro nenhum — comportamento inalterado.
 */
async function passesLiveRegimeGate(strategyId: number, pair: string, timeframe: string, executionMode: ExecutionMode = 'PAPER_TRADING'): Promise<boolean> {
  // SHADOW mode: gera sinal sem filtro de regime (para comparação)
  // PAPER_TRADING e LIVE: aplica filtro de regime normalmente
  if (executionMode === 'SHADOW') return true;

  // Verifica se a estratégia deve passar pelo filtro de regime neste timeframe.
  // REGIME_GATED_STRATEGIES_LIVE (array simples): filtro sempre aplicado, qualquer TF.
  // REGIME_GATED_STRATEGIES_BY_TF (mapa com TF): filtro aplicado só nos TFs listados.
  const alwaysGated = REGIME_GATED_STRATEGIES_LIVE.includes(strategyId);
  const gatedByTF = REGIME_GATED_STRATEGIES_BY_TF[strategyId]?.includes(timeframe);
  if (!alwaysGated && !gatedByTF) return true; // nem sempre nem por TF → passa livre

  try {
    const regimeKlines = await getKlines(pair, '1h', 300);
    const classification = classifyRegime(regimeKlines);
    if (!classification) return false; // dado insuficiente — conservador, não libera
    return regimeAllowsStrategy(classification, strategyId);
  } catch (e: any) {
    console.error(`Erro ao checar regime pra ${pair}:`, e?.message);
    return false; // erro de dado — conservador, não libera
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Contexto no momento do sinal (Fase 2 — registro completo, 04/09/2026).
// Tudo aqui é best-effort: se uma chamada externa falhar, o sinal ainda é
// salvo normalmente, só sem esse dado extra — nunca bloqueia a geração.
// Os caches são criados DE NOVO a cada chamada de generateSignals (não são
// globais do módulo), pra nunca servir dado velho de um ciclo anterior do
// agendador, que é um processo Node de vida longa.
// ─────────────────────────────────────────────────────────────────────────

export interface EnrichedSignalData extends SignalData {
  riskRewardRatio?: number | null;
  marketRegime?: string | null;
  regimeForce?: number | null;
  atrRatio?: number | null;
  volumeRatio?: number | null;
  fundingRateAtSignal?: number | null;
  spreadAtSignal?: number | null;
  indicators?: Record<string, unknown> | null;
  robotVersion?: string;
  weightAtSignal?: number | null; // peso da estratégia (Fase 7) no momento do sinal — informativo, ver lib/strategy-weights.ts
  mlProbability?: number | null; // probabilidade estimada de TP-antes-SL pelo modelo ativo (Fase 6) — informativo, ver lib/ml-model.ts
  mlModelVersion?: number | null;
  executionMode?: string;
  strategyEligibility?: StrategyEligibilityResult | null; // audit-only; não bloqueia sinal nesta versão
}

function attachStrategyEligibilityAudit(signals: EnrichedSignalData[]): void {
  const cycleCandidates = signals.map((sig) => ({
    strategyId: sig.strategyId,
    pair: sig.pair,
    timeframe: sig.timeframe,
    direction: sig.direction,
    confidence: sig.confidence,
    mlProbability: sig.mlProbability,
  }));

  for (const sig of signals) {
    const result = evaluateStrategyEligibility({
      signal: sig,
      context: { cycleCandidates },
      config: STRATEGY_ELIGIBILITY_CONFIG_V1,
    });
    sig.strategyEligibility = result;

    if (!result.eligible) {
      console.warn(
        `[strategy-eligibility][audit-only] ${sig.strategyName} ${sig.pair} ${sig.direction} ${sig.timeframe} ` +
          `INELIGIBLE — ${result.reasonCodes.join(', ')} fp=${result.audit.configFingerprint}`
      );
    }
  }
}

function indicatorsWithEligibilityAudit(sig: EnrichedSignalData): Record<string, unknown> | null {
  if (!sig.strategyEligibility) return sig.indicators ?? null;
  return {
    ...(sig.indicators ?? {}),
    strategyEligibility: sig.strategyEligibility,
  };
}

function indicatorsJsonForPrisma(sig: EnrichedSignalData): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  const indicators = indicatorsWithEligibilityAudit(sig);
  return indicators === null ? Prisma.JsonNull : (indicators as Prisma.InputJsonValue);
}

interface EnrichmentCaches {
  regime: Map<string, RegimeClassification | null>;
  funding: Map<string, number | null>;
  spread: Map<string, number | null>;
}

function createEnrichmentCaches(): EnrichmentCaches {
  return { regime: new Map(), funding: new Map(), spread: new Map() };
}

async function getCachedRegime(pair: string, caches: EnrichmentCaches): Promise<RegimeClassification | null> {
  if (caches.regime.has(pair)) return caches.regime.get(pair)!;
  let result: RegimeClassification | null = null;
  try {
    const klines = await getKlines(pair, '1h', 300);
    result = classifyRegime(klines);
  } catch (e: any) {
    console.error(`Erro ao classificar regime pra ${pair} (registro):`, e?.message);
  }
  caches.regime.set(pair, result);
  return result;
}

async function getCachedFundingRate(pair: string, caches: EnrichmentCaches): Promise<number | null> {
  if (caches.funding.has(pair)) return caches.funding.get(pair)!;
  let rate: number | null = null;
  try {
    const fr = await getFundingRate(pair);
    rate = fr ? parseFloat(fr.fundingRate) : null;
  } catch (e: any) {
    console.error(`Erro ao buscar funding rate pra ${pair} (registro):`, e?.message);
  }
  caches.funding.set(pair, rate);
  return rate;
}

async function getCachedSpreadPercent(pair: string, caches: EnrichmentCaches): Promise<number | null> {
  if (caches.spread.has(pair)) return caches.spread.get(pair)!;
  let spread: number | null = null;
  try {
    const bt = await getBookTicker(pair);
    if (bt && bt.bidPrice > 0) spread = ((bt.askPrice - bt.bidPrice) / bt.bidPrice) * 100;
  } catch (e: any) {
    console.error(`Erro ao buscar book ticker pra ${pair} (registro):`, e?.message);
  }
  caches.spread.set(pair, spread);
  return spread;
}

function computeRiskReward(signal: SignalData): number | null {
  const risk = Math.abs(signal.entryPrice - signal.stopLoss);
  const reward = Math.abs(signal.target1 - signal.entryPrice);
  if (risk <= 0) return null;
  return reward / risk;
}

async function enrichSignal(signal: SignalData, caches: EnrichmentCaches): Promise<EnrichedSignalData> {
  const [regime, fundingRateAtSignal, spreadAtSignal] = await Promise.all([
    getCachedRegime(signal.pair, caches),
    getCachedFundingRate(signal.pair, caches),
    getCachedSpreadPercent(signal.pair, caches),
  ]);

  return {
    ...signal,
    riskRewardRatio: computeRiskReward(signal),
    marketRegime: regime?.regime ?? null,
    regimeForce: regime?.force ?? null,
    atrRatio: regime?.details?.atrRatio ?? null,
    volumeRatio: regime?.details?.volumeRatio ?? null,
    fundingRateAtSignal,
    spreadAtSignal,
    indicators: regime
      ? { ema20: regime.details.ema20, ema50: regime.details.ema50, ema200: regime.details.ema200, vwap: regime.details.vwap }
      : null,
    robotVersion: ROBOT_VERSION,
  };
}

/**
 * Roda cada estratégia contra cada par do plano, só nos timeframes
 * permitidos pra aquela combinação. Retorna os novos sinais encontrados
 * (ainda não salvos no banco).
 */
// Quantas combinações rodam ao mesmo tempo em generateSignals/closeTriggeredSignals.
// Descoberto em produção (01/09/2026): sequencial, uma combinação de cada
// vez, estourava os 60s de limite de uma função serverless (Vercel Hobby)
// assim que o plano tinha ~25+ combinações — cada uma faz pelo menos uma
// chamada de rede à Binance. Um teto (em vez de paralelo irrestrito) evita
// martelar a Binance com dezenas de chamadas simultâneas de uma vez.
const SIGNAL_GENERATION_CONCURRENCY = 6;

export async function generateSignals(plan: PairStrategyPlan): Promise<EnrichedSignalData[]> {
  // Modo de execução (Fase 9) — checado ANTES de qualquer outra coisa.
  // Se alguém configurou EXECUTION_MODE=LIVE, para aqui com um erro claro
  // (nunca gera sinal nenhum nesse caso) — ver lib/execution-mode.ts.
  const executionMode = getConfiguredExecutionMode();
  assertLiveExecutionNotAttempted(executionMode);

  const newSignals: EnrichedSignalData[] = [];
  const enrichmentCaches = createEnrichmentCaches();

  // Combinações pausadas automaticamente por divergência persistente
  // (ver lib/divergence-check.ts) não geram sinal novo, mesmo que o
  // usuário ainda tenha a estratégia/par habilitados em Configurações.
  // Import dinâmico pra evitar dependência circular (divergence-check.ts
  // também importa deste arquivo).
  const { getPausedComboKeys } = await import('@/lib/divergence-check');
  const pausedCombos = await getPausedComboKeys().catch(() => new Set<string>());

  const combos: { pair: string; strategyId: number; tf: string }[] = [];
  for (const [pair, strategyTimeframes] of Object.entries(plan)) {
    for (const [strategyIdStr, timeframes] of Object.entries(strategyTimeframes)) {
      const strategyId = Number(strategyIdStr);
      const strat = STRATEGY_DEFS.find((s) => s.id === strategyId);
      if (!strat) continue;
      for (const tf of timeframes) {
        if (pausedCombos.has(`${strategyId}|${pair}|${tf}`)) continue;
        combos.push({ pair, strategyId, tf });
      }
    }
  }

  // Circuit breakers de risco (Fase 8) — reavalia as condições brutas (e
  // persiste/alerta qualquer disparo NOVO) toda vez que generateSignals
  // roda, seja pelo agendador, pela rota manual "Analisar Agora" ou pelo
  // cron HTTP — os três passam por aqui, então um só lugar cobre todos.
  // Se algum breaker estiver ativo, NENHUM sinal novo é gerado (sinais já
  // pendentes continuam sendo monitorados/fechados normalmente em outro
  // lugar, isso aqui não mexe neles).
  const breakerState = await evaluateCircuitBreakers();
  if (breakerState.activeReasons.length > 0) {
    console.warn(`[circuit-breakers] Geração de sinal pausada — ${breakerState.activeReasons.join(' | ')}`);
    return newSignals;
  }

  // Peso dinâmico por estratégia (Fase 7) — leitura simples do peso mais
  // recente já calculado (nunca recalcula aqui; ver
  // lib/strategy-weights.ts). Sem nenhum `npm run weights:recompute`
  // rodado ainda, tudo vem neutro (1.0) e a ordem abaixo não muda.
  const strategyWeights = await getLatestStrategyWeights();

  // Modelos ML ativos por estratégia (Fase 6) — leitura simples, nunca
  // treina nada aqui (ver lib/ml-model.ts). Estratégia sem modelo ativo
  // simplesmente não aparece no mapa; sinais dela saem sem mlProbability,
  // exatamente como antes da Fase 6 existir.
  const activeModels = await getActiveModelsByStrategy();

  // Limites de exposição (Fase 8) — não exigem reset manual, ver
  // lib/circuit-breakers.ts. Reduz `combos` ANTES de gastar chamada de
  // rede tentando gerar sinal pra combinação que nem poderia ser salva.
  // Quando o limite por par é atingido, o peso (Fase 7) decide qual
  // estratégia preenche as vagas restantes primeiro.
  const exposureResult = await filterCombosByExposure(combos, strategyWeights);
  if (exposureResult.blockedTotal) {
    console.warn('[circuit-breakers] Geração de sinal pausada — limite total de sinais pendentes atingido.');
    return newSignals;
  }
  if (exposureResult.blockedPairs.length) {
    console.warn(`[circuit-breakers] Par(es) no limite de exposição, sem sinal novo pra ele(s) nesta rodada: ${exposureResult.blockedPairs.join(', ')}`);
  }
  const finalCombos = exposureResult.allowed;

  let cursor = 0;
  async function worker() {
    while (cursor < finalCombos.length) {
      const { pair, strategyId, tf } = finalCombos[cursor++];
      const strat = STRATEGY_DEFS.find((s) => s.id === strategyId);
      if (!strat) continue;
      try {
        let signal: SignalData | null = null;
        if (strat.id === 4) {
          signal = await (strat.analyze as any)(pair);
        } else {
          signal = await (strat.analyze as any)(pair, tf);
        }
        if (signal && (await passesLiveRegimeGate(strategyId, pair, tf, executionMode))) {
          signal.leverage = clampLeverageString(signal.leverage); // Fase 8 — só pode reduzir, nunca aumentar
          const enriched = await enrichSignal(signal, enrichmentCaches);
          enriched.weightAtSignal = strategyWeights.get(strategyId) ?? 1.0; // Fase 7 — informativo, não muda leverage/stop/alvo
          const mlScore = scoreSignalWithActiveModel(activeModels, strategyId, {
            direction: enriched.direction,
            entryPrice: enriched.entryPrice,
            target1: enriched.target1,
            stopLoss: enriched.stopLoss,
            confidence: enriched.confidence,
            marketRegime: enriched.marketRegime,
            regimeForce: enriched.regimeForce,
            atrRatio: enriched.atrRatio,
            volumeRatio: enriched.volumeRatio,
          }); // Fase 6 — informativo, não muda leverage/stop/alvo/entrada
          if (mlScore) {
            enriched.mlProbability = mlScore.probability;
            enriched.mlModelVersion = mlScore.modelVersion;
          }
          enriched.executionMode = executionMode; // Fase 9 — SHADOW nunca chega a ser salvo, ver saveNewSignals
          newSignals.push(enriched);
        }
      } catch (e: any) {
        console.error(`Strategy ${strat.id} error for ${pair}/${tf}:`, e?.message);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SIGNAL_GENERATION_CONCURRENCY, finalCombos.length) }, () => worker())
  );

  attachStrategyEligibilityAudit(newSignals);

  return newSignals;
}

/**
 * Salva os sinais novos, descartando duplicados (mesma estratégia/par/direção
 * nas últimas 4h). Retorna os que foram efetivamente gravados.
 *
 * Ponto único de decisão do modo SHADOW (Fase 9): um sinal gerado em
 * modo shadow já passou por todo o resto do pipeline (enriquecimento,
 * peso, modelo ML, circuit breakers) exatamente como em PAPER_TRADING,
 * mas NUNCA é persistido nem contabilizado — só aparece no log do ciclo.
 * Fazer esse corte aqui, num só lugar, garante que ele nunca escapa pra
 * notificação (notifySubscribedUsers só recebe o que este função de fato
 * retorna) nem pra qualquer estatística que leia a tabela Signal depois.
 */
export async function saveNewSignals(newSignals: EnrichedSignalData[]) {
  const saved = [];
  for (const sig of newSignals) {
    const enriched = sig as EnrichedSignalData;
    if (enriched.executionMode === 'SHADOW') {
      // Fase C — SHADOW EVALUATION (09/09/2026):
      // Em SHADOW mode, o sinal NÃO vai para o PAPER_TRADING (source=live),
      // mas É persistido com source=shadow_v{N} para análise comparativa.
      // O source distingue a versão do ConfigVersion que gerou o sinal.
      // Isola o período shadow do histórico PAPER_TRADING para comparação limpa.
      const sourceTag = `shadow_v${CURRENT_CONFIG_VERSION}` as SignalSource;
      const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const dup = await prisma.signal.findFirst({
        where: {
          strategyId: sig.strategyId,
          pair: sig.pair,
          direction: sig.direction,
          timeframe: sig.timeframe,
          source: sourceTag,
          createdAt: { gte: fourHoursAgo },
        },
      });
      if (dup) continue;

      const dataToCreate = {
        strategyId: sig.strategyId,
        strategyName: sig.strategyName,
        pair: sig.pair,
        direction: sig.direction,
        timeframe: sig.timeframe,
        mode: sig.mode,
        entryPrice: sig.entryPrice,
        target1: sig.target1,
        target2: sig.target2,
        stopLoss: sig.stopLoss,
        leverage: sig.leverage,
        confidence: sig.confidence,
        reason: sig.reason,
        source: sourceTag,
        executionMode: 'SHADOW',
        status: 'PENDENTE',
        result: null,
        pnlPercent: null,
        pnlNetPercent: null,
        closedAt: null,
        exitPrice: null,
        exitReason: null,
        feesPercent: null,
        slippagePercent: null,
        fundingCostPercent: null,
        maxAdverseExcursionPercent: null,
        executionError: null,
        target2Reached: false,
        riskRewardRatio: (sig as any).riskRewardRatio ?? null,
        marketRegime: (sig as any).marketRegime ?? null,
        regimeForce: (sig as any).regimeForce ?? null,
        atrRatio: (sig as any).atrRatio ?? null,
        volumeRatio: (sig as any).volumeRatio ?? null,
        fundingRateAtSignal: (sig as any).fundingRateAtSignal ?? null,
        spreadAtSignal: (sig as any).spreadAtSignal ?? null,
        indicators: indicatorsJsonForPrisma(enriched),
        robotVersion: (sig as any).robotVersion ?? null,
        weightAtSignal: (sig as any).weightAtSignal ?? null,
        mlProbability: (sig as any).mlProbability ?? null,
        mlModelVersion: (sig as any).mlModelVersion ?? null,
      };
      const created = await prisma.signal.create({ data: dataToCreate });
      saved.push(created);
      console.log(`[shadow-registered] ${sig.strategyName} ${sig.pair} ${sig.direction} ${sig.timeframe} — conf=${sig.confidence} regime=${enriched.marketRegime ?? 'N/A'} source=shadow_v${CURRENT_CONFIG_VERSION}`);
      continue;
    }

    // PAPER_TRADING: salva no histórico principal
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const dup = await prisma.signal.findFirst({
      where: {
        strategyId: sig.strategyId,
        pair: sig.pair,
        direction: sig.direction,
        timeframe: sig.timeframe,
        source: { in: ['live', 'PAPER_TRADING'] },
        createdAt: { gte: fourHoursAgo },
      },
    });
    if (dup) continue;

    const created = await prisma.signal.create({
      data: {
        strategyId: sig.strategyId,
        strategyName: sig.strategyName,
        pair: sig.pair,
        direction: sig.direction,
        timeframe: sig.timeframe,
        mode: sig.mode,
        entryPrice: sig.entryPrice,
        target1: sig.target1,
        target2: sig.target2,
        stopLoss: sig.stopLoss,
        leverage: sig.leverage,
        confidence: sig.confidence,
        reason: sig.reason,
        status: 'PENDENTE',
        result: null,
        pnlPercent: null,
        source: (sig as any).source ?? 'live',
        executionMode: (sig as any).executionMode ?? 'PAPER_TRADING',
        riskRewardRatio: (sig as any).riskRewardRatio ?? null,
        marketRegime: (sig as any).marketRegime ?? null,
        regimeForce: (sig as any).regimeForce ?? null,
        atrRatio: (sig as any).atrRatio ?? null,
        volumeRatio: (sig as any).volumeRatio ?? null,
        fundingRateAtSignal: (sig as any).fundingRateAtSignal ?? null,
        spreadAtSignal: (sig as any).spreadAtSignal ?? null,
        indicators: indicatorsJsonForPrisma(enriched),
        robotVersion: (sig as any).robotVersion ?? null,
        weightAtSignal: (sig as any).weightAtSignal ?? null,
        mlProbability: (sig as any).mlProbability ?? null,
        mlModelVersion: (sig as any).mlModelVersion ?? null,
      },
    });
    saved.push(created);
  }
  return saved;
}


/**
 * Envia e-mail e/ou Telegram para todo usuário com alertas ligados que
 * tenha essa estratégia marcada. Sinais não têm dono (são globais no app),
 * então a notificação é "quem quiser saber, se inscreve".
 */
export async function notifySubscribedUsers(savedSignals: any[]): Promise<void> {
  if (!savedSignals.length) return;

  const subscribers = await prisma.userSettings.findMany({
    where: {
      OR: [
        { emailAlerts: true, alertEmail: { not: null } },
        { telegramAlerts: true, telegramChatId: { not: null } },
      ],
    },
  });
  if (!subscribers.length) return;

  for (const sig of savedSignals) {
    for (const sub of subscribers) {
      if (sub.emailAlerts && sub.alertEmail && sub.emailStrategies?.includes(sig.strategyId)) {
        try {
          await sendSignalEmail(sig, sub.alertEmail);
        } catch (e: any) {
          console.error('Email error:', e?.message);
        }
      }
      if (sub.telegramAlerts && sub.telegramChatId && sub.telegramStrategies?.includes(sig.strategyId)) {
        try {
          await sendSignalTelegram(sig, sub.telegramChatId);
        } catch (e: any) {
          console.error('Telegram error:', e?.message);
        }
      }
    }
  }
}

/**
 * Notifica quando um sinal fecha (alvo 1 = WIN, stop = LOSS) ou quando um
 * sinal já vencido também alcança o alvo 2 (bônus informativo). Usa a
 * mesma lista de inscritos e as mesmas estratégias marcadas para alerta
 * de "novo sinal" — quem quer saber que o sinal nasceu também costuma
 * querer saber como ele terminou.
 */
export async function notifySignalOutcomes(
  closedSignals: Array<{ signal: any; outcome: 'WIN' | 'LOSS' }>,
  target2Signals: Array<{ signal: any }>
): Promise<void> {
  if (!closedSignals.length && !target2Signals.length) return;

  const subscribers = await prisma.userSettings.findMany({
    where: {
      OR: [
        { emailAlerts: true, alertEmail: { not: null } },
        { telegramAlerts: true, telegramChatId: { not: null } },
      ],
    },
  });
  if (!subscribers.length) return;

  for (const { signal, outcome } of closedSignals) {
    for (const sub of subscribers) {
      if (sub.emailAlerts && sub.alertEmail && sub.emailStrategies?.includes(signal.strategyId)) {
        try { await sendOutcomeEmail(signal, sub.alertEmail, outcome); } catch (e: any) { console.error('Email outcome error:', e?.message); }
      }
      if (sub.telegramAlerts && sub.telegramChatId && sub.telegramStrategies?.includes(signal.strategyId)) {
        try { await sendOutcomeTelegram(signal, sub.telegramChatId, outcome); } catch (e: any) { console.error('Telegram outcome error:', e?.message); }
      }
    }
  }

  for (const { signal } of target2Signals) {
    for (const sub of subscribers) {
      if (sub.emailAlerts && sub.alertEmail && sub.emailStrategies?.includes(signal.strategyId)) {
        try { await sendOutcomeEmail(signal, sub.alertEmail, 'TARGET2'); } catch (e: any) { console.error('Email outcome error:', e?.message); }
      }
      if (sub.telegramAlerts && sub.telegramChatId && sub.telegramStrategies?.includes(signal.strategyId)) {
        try { await sendOutcomeTelegram(signal, sub.telegramChatId, 'TARGET2'); } catch (e: any) { console.error('Telegram outcome error:', e?.message); }
      }
    }
  }
}

