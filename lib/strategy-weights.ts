// Peso dinâmico entre estratégias (Fase 7, 05/09/2026).
//
// O que o peso FAZ: decide a ordem de prioridade entre estratégias quando
// o limite de exposição por par (Fase 8, RISK_MAX_OPEN_SIGNALS_PER_PAIR)
// é atingido no mesmo ciclo de geração — quem tem peso maior preenche as
// vagas disponíveis primeiro. Também fica gravado em Signal.weightAtSignal
// (informativo) e em StrategyStats-like reports pra acompanhamento.
//
// O que o peso NUNCA faz: não muda leverage, stop, alvo, nem qualquer
// limite de risco (RISK_MAX_* em lib/risk-limits.ts); não desliga uma
// estratégia sozinho (isso continua sendo decisão manual em
// Configurações → Estratégia por Moeda); não bloqueia geração de sinal —
// só reordena prioridade dentro do que os circuit breakers já permitem.
// Nenhuma estratégia recebe peso abaixo de WEIGHT_FLOOR, mesmo com
// desempenho líquido muito ruim — um "veto" automático seria equivalente
// a substituir a estratégia sozinho, o que o usuário pediu pra nunca
// acontecer sem avaliação humana.
//
// Como o peso é calculado (simples e explicável de propósito — não é ML,
// é uma normalização linear de uma métrica já auditada na Fase 3):
//   1. Pra cada uma das 6 estratégias, pega os sinais reais (source=live)
//      fechados (WIN/LOSS) nos últimos WEIGHTS_LOOKBACK_DAYS dias.
//   2. Calcula a expectância líquida (%/trade, já com taxa+funding+
//      slippage — lib/metrics-extended.ts computeExtendedMetrics).
//   3. Estratégia com amostra < MIN_SAMPLE_OVERALL (Fase 3, hoje 20)
//      fica "neutra": peso 1.0, sem penalidade nem bônus — não há dado
//      suficiente pra julgar, então não julga.
//   4. Com pelo menos 2 estratégias com amostra suficiente, normaliza a
//      expectância líquida delas linearmente pro intervalo
//      [WEIGHT_FLOOR, WEIGHT_CEILING]. Com 0 ou 1 estratégia qualificada,
//      não há base de comparação — todas ficam neutras (1.0) também.
//
// O cálculo NUNCA roda sozinho — só quando alguém chama
// recomputeStrategyWeights() explicitamente (via
// `npm run weights:recompute`, ver scripts/recompute-weights.ts). Até a
// primeira vez que isso rodar, getLatestStrategyWeights() devolve 1.0
// (neutro) pra tudo — ou seja, zero mudança de comportamento até o
// usuário decidir ativar isso.
import { prisma } from './prisma';
import { STRATEGY_DEFS } from './strategies';
import { ROBOT_VERSION } from './version';
import {
  computeExtendedMetrics,
  signalRowToEvaluationTrade,
  EvaluationTrade,
  MIN_SAMPLE_OVERALL,
} from './metrics-extended';

// Quantos dias olhar pra trás ao calcular o peso — janela deslizante, não
// o histórico inteiro, pra que o peso reflita desempenho recente (ver
// pedido original: "aprender e melhorar progressivamente"). Configurável
// porque não há um valor "certo" — é uma escolha de trade-off entre
// reagir rápido e ter amostra suficiente.
export const WEIGHTS_LOOKBACK_DAYS = parseInt(process.env.WEIGHTS_LOOKBACK_DAYS ?? '60', 10);

// Nenhuma estratégia fica abaixo disso, mesmo com o pior desempenho
// líquido do grupo — evita que o peso funcione como um veto automático
// (isso continua sendo decisão manual do usuário).
export const WEIGHT_FLOOR = 0.3;
export const WEIGHT_CEILING = 1.0;
// Peso padrão pra estratégia sem amostra suficiente ou sem base de
// comparação — nem penalizado, nem favorecido.
export const NEUTRAL_WEIGHT = 1.0;

export interface StrategyWeightComputation {
  strategyId: number;
  strategyName: string;
  weight: number;
  rawExpectancyNet: number | null;
  sampleSize: number;
  sufficientSample: boolean;
  neutral: boolean;
}

async function loadRecentTrades(strategyId: number, since: Date): Promise<EvaluationTrade[]> {
  const signals = await prisma.signal.findMany({
    where: { source: 'live', status: { in: ['WIN', 'LOSS'] }, strategyId, closedAt: { gte: since } },
    orderBy: { closedAt: 'asc' },
  });
  return signals.map(signalRowToEvaluationTrade);
}

export interface RawStrategySample {
  strategyId: number;
  strategyName: string;
  sampleSize: number;
  sufficientSample: boolean;
  expectancyNet: number | null;
}

/**
 * Núcleo puro de computeStrategyWeights — recebe a amostra já calculada
 * por estratégia (expectância líquida, tamanho de amostra) e devolve os
 * pesos normalizados. Nenhuma chamada a banco aqui. Extraído (23/10/2026)
 * pra poder testar a matemática do piso/teto e os casos de neutralidade
 * sem precisar de dado real.
 */
export function normalizeStrategyWeights(raw: RawStrategySample[]): StrategyWeightComputation[] {
  const qualified = raw.filter((r) => r.sufficientSample && r.expectancyNet !== null);

  // Menos de 2 estratégias com amostra suficiente = não há base pra
  // comparar relativamente ("estratégia A é melhor que B" exige as duas
  // terem dado suficiente) — todo mundo fica neutro.
  if (qualified.length < 2) {
    return raw.map((r) => ({
      strategyId: r.strategyId,
      strategyName: r.strategyName,
      weight: NEUTRAL_WEIGHT,
      rawExpectancyNet: r.expectancyNet,
      sampleSize: r.sampleSize,
      sufficientSample: r.sufficientSample,
      neutral: true,
    }));
  }

  const values = qualified.map((r) => r.expectancyNet!);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;

  return raw.map((r) => {
    if (!r.sufficientSample || r.expectancyNet === null) {
      return {
        strategyId: r.strategyId,
        strategyName: r.strategyName,
        weight: NEUTRAL_WEIGHT,
        rawExpectancyNet: r.expectancyNet,
        sampleSize: r.sampleSize,
        sufficientSample: r.sufficientSample,
        neutral: true,
      };
    }
    // Todas as qualificadas empatadas (spread 0) — sem diferença real
    // pra refletir, todas ficam no teto (1.0), não no chão.
    const weight = spread === 0
      ? WEIGHT_CEILING
      : WEIGHT_FLOOR + ((r.expectancyNet - min) / spread) * (WEIGHT_CEILING - WEIGHT_FLOOR);
    return {
      strategyId: r.strategyId,
      strategyName: r.strategyName,
      weight,
      rawExpectancyNet: r.expectancyNet,
      sampleSize: r.sampleSize,
      sufficientSample: r.sufficientSample,
      neutral: false,
    };
  });
}

/**
 * Calcula (sem persistir) o peso de cada uma das 6 estratégias com base
 * na expectância líquida dos últimos WEIGHTS_LOOKBACK_DAYS dias. Função
 * pura de leitura — quem quiser persistir chama
 * recomputeStrategyWeights() abaixo.
 */
export async function computeStrategyWeights(
  lookbackDays: number = WEIGHTS_LOOKBACK_DAYS
): Promise<StrategyWeightComputation[]> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  const raw = await Promise.all(
    STRATEGY_DEFS.map(async (strat) => {
      const trades = await loadRecentTrades(strat.id, since);
      const metrics = computeExtendedMetrics(trades);
      const sufficientSample = metrics.totalTrades >= MIN_SAMPLE_OVERALL;
      return {
        strategyId: strat.id,
        strategyName: strat.name,
        sampleSize: metrics.totalTrades,
        sufficientSample,
        expectancyNet: sufficientSample ? metrics.expectancyNet : null,
      };
    })
  );

  return normalizeStrategyWeights(raw);
}

/**
 * Calcula e PERSISTE uma nova rodada de pesos (linhas novas, nunca
 * sobrescreve — ver comentário do model StrategyWeight no schema). Só
 * roda quando chamado explicitamente (CLI `npm run weights:recompute`),
 * nunca automaticamente dentro de generateSignals().
 */
export async function recomputeStrategyWeights(
  lookbackDays: number = WEIGHTS_LOOKBACK_DAYS
): Promise<StrategyWeightComputation[]> {
  const results = await computeStrategyWeights(lookbackDays);
  await prisma.strategyWeight.createMany({
    data: results.map((r) => ({
      strategyId: r.strategyId,
      strategyName: r.strategyName,
      weight: r.weight,
      rawExpectancyNet: r.rawExpectancyNet,
      sampleSize: r.sampleSize,
      sufficientSample: r.sufficientSample,
      lookbackDays,
      neutral: r.neutral,
      robotVersion: ROBOT_VERSION,
    })),
  });
  return results;
}

/**
 * Leitura rápida (sem recalcular) do peso mais recente já persistido por
 * estratégia — usado a cada ciclo de generateSignals(). Estratégia sem
 * nenhuma linha ainda (recompute nunca rodou) recebe o peso neutro 1.0,
 * preservando o comportamento atual até o usuário rodar
 * `npm run weights:recompute` pela primeira vez.
 */
export async function getLatestStrategyWeights(): Promise<Map<number, number>> {
  const weights = new Map<number, number>();
  for (const strat of STRATEGY_DEFS) weights.set(strat.id, NEUTRAL_WEIGHT);

  const latestRows = await prisma.strategyWeight.findMany({
    where: { strategyId: { in: STRATEGY_DEFS.map((s) => s.id) } },
    orderBy: { computedAt: 'desc' },
    // Não dá pra usar distinct+orderBy com segurança em todo provider, mas
    // com só 6 estratégias trazer um lote recente e filtrar em memória é
    // simples e barato — evita depender de um recurso específico do Postgres.
    take: STRATEGY_DEFS.length * 5,
  });

  const seen = new Set<number>();
  for (const row of latestRows) {
    if (seen.has(row.strategyId)) continue;
    seen.add(row.strategyId);
    weights.set(row.strategyId, row.weight);
  }

  return weights;
}
