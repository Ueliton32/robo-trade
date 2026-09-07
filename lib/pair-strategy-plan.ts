// Extraído de lib/analysis-engine.ts (06/09/2026) pelo mesmo motivo que
// lib/ops-notify.ts e lib/system-state-keys.ts já tinham sido extraídos:
// lib/circuit-breakers.ts precisa saber quais combinações par/estratégia
// estão ATIVAS na configuração de hoje (pra excluir histórico de
// estratégia já desativada do cálculo de drawdown — ver checkMaxDrawdown),
// mas lib/analysis-engine.ts já importa de lib/circuit-breakers.ts
// (evaluateCircuitBreakers, filterCombosByExposure, clampLeverageString).
// Se este código continuasse morando em analysis-engine.ts, importar dali
// em circuit-breakers.ts criaria um ciclo (analysis-engine -> circuit-
// breakers -> analysis-engine). Nenhuma lógica mudou aqui, só o arquivo.
import { prisma } from './prisma';
import { STRATEGY_DEFS } from './strategies';
import { MONITORED_PAIRS } from './binance';

// Par → estratégia → quais timeframes dessa estratégia rodam pra esse par.
export type PairStrategyPlan = Record<string, Record<number, string[]>>;

/**
 * Monta o plano completo pra um usuário: pares sem override em
 * pairStrategies usam a lista global enabledStrategies; pares com override
 * usam só as estratégias marcadas especificamente pra eles. Timeframes
 * seguem os padrões de cada estratégia, a menos que pairStrategyTimeframes
 * restrinja pra um (par, estratégia) específico.
 */
export function buildPairStrategyPlan(settings: {
  monitoredPairs?: string[] | null;
  enabledStrategies?: number[] | null;
  pairStrategies?: unknown;
  pairStrategyTimeframes?: unknown;
} | null): PairStrategyPlan {
  const pairs = settings?.monitoredPairs?.length ? settings.monitoredPairs : MONITORED_PAIRS;
  const defaultStrats = settings?.enabledStrategies?.length ? settings.enabledStrategies : [1, 2, 3, 4, 5, 6];
  const strategyOverrides = (settings?.pairStrategies ?? {}) as Record<string, number[]>;
  const timeframeOverrides = (settings?.pairStrategyTimeframes ?? {}) as Record<string, Record<string, string[]>>;

  const plan: PairStrategyPlan = {};
  for (const pair of pairs) {
    const enabledIds = strategyOverrides?.[pair]?.length ? strategyOverrides[pair] : defaultStrats;
    plan[pair] = {};
    for (const id of enabledIds) {
      const strat = STRATEGY_DEFS.find((s) => s.id === id);
      if (!strat) continue;
      const tfOverride = timeframeOverrides?.[pair]?.[String(id)];
      const timeframes = tfOverride?.length ? tfOverride.filter((tf) => strat.timeframes.includes(tf)) : strat.timeframes;
      if (timeframes.length) plan[pair][id] = timeframes;
    }
  }
  return plan;
}

/**
 * Plano completo pra uma rodada sem usuário logado (ex: o agendador em
 * background): mescla (união) o que cada usuário configurou — inclusive
 * os timeframes restritos por par. Se ninguém configurou nada ainda, usa
 * os defaults globais com todas as estratégias e seus timeframes padrão.
 */
export async function getGlobalPairStrategyPlan(): Promise<PairStrategyPlan> {
  const allSettings = await prisma.userSettings.findMany();

  if (!allSettings.length) {
    const plan: PairStrategyPlan = {};
    for (const p of MONITORED_PAIRS) {
      plan[p] = {};
      for (const strat of STRATEGY_DEFS) plan[p][strat.id] = strat.timeframes;
    }
    return plan;
  }

  const merged: Record<string, Record<number, Set<string>>> = {};
  for (const s of allSettings) {
    const userPlan = buildPairStrategyPlan(s as any);
    for (const [pair, strategyTimeframes] of Object.entries(userPlan)) {
      if (!merged[pair]) merged[pair] = {};
      for (const [idStr, tfs] of Object.entries(strategyTimeframes)) {
        const id = Number(idStr);
        if (!merged[pair][id]) merged[pair][id] = new Set();
        tfs.forEach((tf) => merged[pair][id].add(tf));
      }
    }
  }

  const result: PairStrategyPlan = {};
  for (const [pair, strategyTimeframes] of Object.entries(merged)) {
    result[pair] = {};
    for (const [idStr, tfSet] of Object.entries(strategyTimeframes)) {
      result[pair][Number(idStr)] = Array.from(tfSet);
    }
  }
  return result;
}

/**
 * Usado por checkMaxDrawdown (lib/circuit-breakers.ts) pra excluir do
 * cálculo de drawdown sinais de combinações (par+estratégia) que já não
 * rodam mais na configuração ATUAL — ex: uma estratégia removida de todos
 * os pares continua no histórico dos últimos 90 dias, mas não devia
 * continuar travando a geração de sinal novo por uma causa já corrigida.
 * "Ativa" aqui = existe em pelo menos um timeframe do plano global (união
 * de todos os usuários), igual ao que generateSignals() realmente roda.
 */
export function isComboActive(plan: PairStrategyPlan, pair: string, strategyId: number): boolean {
  const timeframes = plan[pair]?.[strategyId];
  return !!timeframes && timeframes.length > 0;
}
