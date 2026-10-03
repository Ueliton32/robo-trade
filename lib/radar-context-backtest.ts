import { getHistoricalKlines, getHistoricalFundingRates, Kline } from './binance';
import { REQUIRED_KLINES, STRATEGY_DEFS } from './strategies';
import { classifyRegime, MarketRegime } from './regime';
import { regimeAllowsStrategy } from './radar-context';
import { computeMetrics, TradeLike, ComputedMetrics } from './metrics';
import {
  simulateOutcome,
  dedupCandleGap,
  minutesForTimeframe,
  RESOLUTION_INTERVAL,
  RESOLUTION_LOOKAHEAD_CANDLES,
  detectForStrategy,
} from './backtest-engine';

const REGIME_MIN_KLINES = 210;
const REGIME_WINDOW = 300;

export interface ContextTrade {
  entryTime: Date;
  closedAt: Date;
  direction: 'LONG' | 'SHORT';
  regime: MarketRegime | null;
  status: 'WIN' | 'LOSS';
  pnlPercent: number;
}

export interface RadarContextResult {
  strategyId: number;
  strategyName: string;
  pair: string;
  timeframe: string;
  totalSignalsDetected: number;
  totalAcceptedByRegime: number;
  acceptedTrades: ContextTrade[];
  /** Todos os trades simulados (com regime e direção), pra cortes além do filtro padrão. */
  allTrades: ContextTrade[];
  filteredMetrics: ComputedMetrics;
  unfilteredMetrics: ComputedMetrics;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Roda um gatilho já validado (um dos detectXxx de lib/strategies.ts)
 * contra o histórico real, mas só CONTA como sinal aceito quando o regime
 * de mercado, naquele exato momento, permite esse gatilho (ver
 * lib/radar-context.ts). Retorna as duas métricas lado a lado — com
 * filtro e sem — pra comparar direto se o filtro de contexto ajuda.
 */
export async function backtestRegimeFilteredStrategy(params: {
  strategyId: number;
  pair: string;
  timeframe: string;
  months: number;
}): Promise<RadarContextResult> {
  const { strategyId, pair } = params;
  const timeframe = strategyId === 4 ? '1h' : params.timeframe;
  const months = Math.min(Math.max(params.months, 1), 12);

  const strat = STRATEGY_DEFS.find((s) => s.id === strategyId);
  if (!strat) throw new Error('Estrat\u00e9gia inv\u00e1lida');

  const endTime = Date.now();
  const periodStart = endTime - months * 30 * 24 * 60 * 60 * 1000;
  const required = REQUIRED_KLINES[strategyId] ?? 60;
  const detectionLookbackMs = required * minutesForTimeframe(timeframe) * 60 * 1000;
  const regimeLookbackMs = REGIME_WINDOW * 60 * 60 * 1000; // regime sempre calculado em 1h
  const fetchStart = periodStart - Math.max(detectionLookbackMs, regimeLookbackMs);

  const detectionKlines = await getHistoricalKlines(pair, timeframe, fetchStart, endTime);
  const regimeKlines = timeframe === '1h' ? detectionKlines : await getHistoricalKlines(pair, '1h', fetchStart, endTime);
  const resolutionKlines = timeframe === RESOLUTION_INTERVAL
    ? detectionKlines
    : await getHistoricalKlines(pair, RESOLUTION_INTERVAL, fetchStart, endTime);

  let fundingSeries: Array<{ time: number; rate: number }> = [];
  if (strategyId === 4) {
    fundingSeries = (await getHistoricalFundingRates(pair, fetchStart, endTime))
      .map((f) => ({ time: f.fundingTime, rate: parseFloat(f.fundingRate ?? '0') }))
      .sort((a, b) => a.time - b.time);
  }

  const allTrades: ContextTrade[] = [];
  const acceptedTrades: ContextTrade[] = [];
  const dedupGap = dedupCandleGap(timeframe);
  let lastIdx = -Infinity;
  let fundingIdx = 0;
  let resPointer = 0;
  let regimePointer = 0;
  let totalDetected = 0;

  for (let i = required - 1; i < detectionKlines.length; i++) {
    if (i - lastIdx < dedupGap) continue;
    const window = detectionKlines.slice(i - required + 1, i + 1);

    let fundingRate = 0;
    if (strategyId === 4 && fundingSeries.length) {
      while (fundingIdx < fundingSeries.length - 1 && fundingSeries[fundingIdx + 1].time <= detectionKlines[i].closeTime) {
        fundingIdx++;
      }
      fundingRate = fundingSeries[fundingIdx]?.rate ?? 0;
    }

    const signal = detectForStrategy(strategyId, window, pair, timeframe, fundingRate);
    if (!signal) continue;
    totalDetected++;

    const entryTimeMs = detectionKlines[i].closeTime;

    while (resPointer < resolutionKlines.length && resolutionKlines[resPointer].closeTime <= entryTimeMs) {
      resPointer++;
    }
    const outcome = simulateOutcome(signal, resolutionKlines, resPointer, RESOLUTION_LOOKAHEAD_CANDLES);
    if (!outcome) continue;

    // Alinha o regime ao momento exato do sinal — só candles de 1h já
    // fechados até esse ponto, nunca dado "do futuro".
    while (regimePointer < regimeKlines.length && regimeKlines[regimePointer].closeTime <= entryTimeMs) {
      regimePointer++;
    }
    const regimeWindowEnd = regimePointer;
    const regimeWindowStart = Math.max(0, regimeWindowEnd - REGIME_WINDOW);
    const regimeWindow = regimeKlines.slice(regimeWindowStart, regimeWindowEnd);
    const regimeResult = regimeWindow.length >= REGIME_MIN_KLINES ? classifyRegime(regimeWindow) : null;

    const trade: ContextTrade = {
      entryTime: new Date(entryTimeMs),
      closedAt: outcome.closedAt,
      direction: signal.direction,
      regime: regimeResult?.regime ?? null,
      status: outcome.status,
      pnlPercent: outcome.pnlPercent,
    };
    allTrades.push(trade);

    if (regimeResult && regimeAllowsStrategy(regimeResult, strategyId)) {
      acceptedTrades.push(trade);
    }

    lastIdx = i;
  }

  const toTradeLikes = (list: ContextTrade[]): TradeLike[] =>
    list.map((t) => ({ pair, timeframe, status: t.status, pnlPercent: t.pnlPercent, createdAt: t.entryTime, closedAt: t.closedAt }));

  return {
    strategyId,
    strategyName: strat.name,
    pair,
    timeframe,
    totalSignalsDetected: totalDetected,
    totalAcceptedByRegime: acceptedTrades.length,
    acceptedTrades,
    allTrades,
    filteredMetrics: computeMetrics(toTradeLikes(acceptedTrades)),
    unfilteredMetrics: computeMetrics(toTradeLikes(allTrades)),
    periodStart: new Date(periodStart),
    periodEnd: new Date(endTime),
  };
}
