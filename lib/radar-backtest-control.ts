import { getHistoricalKlines } from './binance';
import { classifyRegime, MarketRegime } from './regime';
import { calcATR } from './indicators';
import { stopTierMultiplier } from './strategies';
import { computeMetrics, TradeLike, ComputedMetrics } from './metrics';
import {
  simulateOutcome,
  dedupCandleGap,
  minutesForTimeframe,
  RESOLUTION_INTERVAL,
  RESOLUTION_LOOKAHEAD_CANDLES,
} from './backtest-engine';

/**
 * Grupo de controle — testado em 10/08/2026 depois que v1 (favorece
 * alinhamento total) e v2 (favorece correção) mostraram padrões
 * inconsistentes e, na maioria das faixas, profit factor abaixo de 1
 * mesmo nos "melhores" casos.
 *
 * Aqui não existe score nenhum: entra em TODA combinação onde o regime dá
 * uma direção (Alta, Alta em Correção, Baixa, Baixa em Correção), sem
 * filtrar por momentum, volume, funding ou qualquer outro critério.
 * Objetivo: descobrir se o problema está nos PESOS do score (e nesse caso
 * o controle deveria ter resultado pior que v1/v2), ou se está no próprio
 * GATILHO de entrada — o regime sozinho, sem nenhum evento de preço
 * específico, simplesmente não é um bom motivo pra entrar (e nesse caso
 * o controle teria resultado parecido com v1/v2, não pior).
 *
 * Também quebra o resultado por tipo de regime — testa isoladamente se
 * "alinhamento total" ou "correção" têm QUALQUER vantagem sozinhos, sem
 * a interferência de momentum/volume/funding que v1 e v2 misturavam.
 */

const REGIME_MIN_KLINES = 210;
const REGIME_WINDOW = 300;

export interface ControlTrade {
  entryTime: Date;
  closedAt: Date;
  direction: 'LONG' | 'SHORT';
  regime: MarketRegime;
  status: 'WIN' | 'LOSS';
  pnlPercent: number;
}

export interface RegimeBreakdown {
  regime: MarketRegime;
  metrics: ComputedMetrics;
}

export interface RadarControlResult {
  pair: string;
  timeframe: string;
  totalCandidatesEvaluated: number;
  trades: ControlTrade[];
  overallMetrics: ComputedMetrics;
  byRegime: RegimeBreakdown[];
  periodStart: Date;
  periodEnd: Date;
  note: string;
}

export async function backtestRadarControl(params: {
  pair: string;
  timeframe: string;
  months: number;
}): Promise<RadarControlResult> {
  const { pair, timeframe } = params;
  const months = Math.min(Math.max(params.months, 1), 12);

  const endTime = Date.now();
  const periodStart = endTime - months * 30 * 24 * 60 * 60 * 1000;
  const lookbackMs = REGIME_WINDOW * minutesForTimeframe(timeframe) * 60 * 1000;
  const fetchStart = periodStart - lookbackMs;

  const klines = await getHistoricalKlines(pair, timeframe, fetchStart, endTime);
  const resolutionKlines = timeframe === RESOLUTION_INTERVAL
    ? klines
    : await getHistoricalKlines(pair, RESOLUTION_INTERVAL, fetchStart, endTime);

  const trades: ControlTrade[] = [];
  const gap = dedupCandleGap(timeframe);
  let lastIdx = -Infinity;
  let resPointer = 0;
  let totalEvaluated = 0;

  for (let i = REGIME_MIN_KLINES - 1; i < klines.length; i++) {
    if (i - lastIdx < gap) continue;

    const windowStart = Math.max(0, i - REGIME_WINDOW + 1);
    const window = klines.slice(windowStart, i + 1);
    if (window.length < REGIME_MIN_KLINES) continue;

    const regimeResult = classifyRegime(window);
    if (!regimeResult) continue;

    const direction: 'LONG' | 'SHORT' | null =
      regimeResult.regime === 'ALTA' || regimeResult.regime === 'ALTA_CORRECAO' ? 'LONG' :
      regimeResult.regime === 'BAIXA' || regimeResult.regime === 'BAIXA_CORRECAO' ? 'SHORT' :
      null;
    if (!direction) continue;

    totalEvaluated++;

    // Níveis genéricos — sem score, sem filtro de nenhum tipo.
    const last = window[window.length - 1];
    const atr = calcATR(window);
    const mult = stopTierMultiplier(pair);
    const swingWindow = window.slice(-21, -1);
    if (swingWindow.length < 20) continue;
    const swingLow = Math.min(...swingWindow.map((k) => k.low));
    const swingHigh = Math.max(...swingWindow.map((k) => k.high));
    const entry = last.close;
    const stop = direction === 'LONG' ? swingLow - atr * 0.5 * mult : swingHigh + atr * 0.5 * mult;
    const risk = Math.abs(entry - stop);
    if (risk <= 0) continue;
    const target1 = direction === 'LONG' ? entry + risk * 1.5 : entry - risk * 1.5;

    const entryTimeMs = last.closeTime;
    while (resPointer < resolutionKlines.length && resolutionKlines[resPointer].closeTime <= entryTimeMs) {
      resPointer++;
    }
    const outcome = simulateOutcome(
      { direction, entryPrice: entry, target1, stopLoss: stop },
      resolutionKlines,
      resPointer,
      RESOLUTION_LOOKAHEAD_CANDLES
    );
    if (!outcome) continue;

    trades.push({
      entryTime: new Date(entryTimeMs),
      closedAt: outcome.closedAt,
      direction,
      regime: regimeResult.regime,
      status: outcome.status,
      pnlPercent: outcome.pnlPercent,
    });
    lastIdx = i;
  }

  const toTradeLikes = (list: ControlTrade[]): TradeLike[] =>
    list.map((t) => ({ pair, timeframe, status: t.status, pnlPercent: t.pnlPercent, createdAt: t.entryTime, closedAt: t.closedAt }));

  const regimeTypes: MarketRegime[] = ['ALTA', 'ALTA_CORRECAO', 'BAIXA', 'BAIXA_CORRECAO'];
  const byRegime: RegimeBreakdown[] = regimeTypes.map((regime) => ({
    regime,
    metrics: computeMetrics(toTradeLikes(trades.filter((t) => t.regime === regime))),
  }));

  return {
    pair,
    timeframe,
    totalCandidatesEvaluated: totalEvaluated,
    trades,
    overallMetrics: computeMetrics(toTradeLikes(trades)),
    byRegime,
    periodStart: new Date(periodStart),
    periodEnd: new Date(endTime),
    note: 'Grupo de controle: sem score, entra em toda combina\u00e7\u00e3o onde o regime d\u00e1 dire\u00e7\u00e3o. Compare com v1/v2 pra saber se o problema \u00e9 o peso do score ou o pr\u00f3prio gatilho de entrada.',
  };
}
