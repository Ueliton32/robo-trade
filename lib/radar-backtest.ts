import { getHistoricalKlines, getHistoricalFundingRates, Kline } from './binance';
import { classifyRegime } from './regime';
import { calcMACD, calcROC, calcATR } from './indicators';
import { stopTierMultiplier } from './strategies';
import { computeMetrics, TradeLike, ComputedMetrics } from './metrics';
import {
  simulateOutcome,
  dedupCandleGap,
  minutesForTimeframe,
  RESOLUTION_INTERVAL,
  RESOLUTION_LOOKAHEAD_CANDLES,
} from './backtest-engine';

// Candles usados pra classificar regime a cada passo — precisa de folga
// sobre o mínimo de 210 que classifyRegime exige (EMA200 estável).
const REGIME_MIN_KLINES = 210;
const REGIME_WINDOW = 300;

export interface ScoredBacktestTrade {
  entryTime: Date;
  closedAt: Date;
  direction: 'LONG' | 'SHORT';
  score: number; // de 0 a 85 — SEM Open Interest, ver nota do resultado
  status: 'WIN' | 'LOSS';
  pnlPercent: number;
}

export interface ScoreBin {
  label: string;
  min: number;
  max: number;
  metrics: ComputedMetrics;
}

export interface RadarBacktestResult {
  pair: string;
  timeframe: string;
  totalCandidatesScored: number;
  trades: ScoredBacktestTrade[];
  bins: ScoreBin[];
  overallMetrics: ComputedMetrics;
  periodStart: Date;
  periodEnd: Date;
  note: string;
}

const SCORE_BIN_DEFS = [
  { label: '0-49 (Não operar)', min: 0, max: 49 },
  { label: '50-69 (Observar)', min: 50, max: 69 },
  { label: '70-84 (Qualificado)', min: 70, max: 84 },
  { label: '85 (Forte, m\u00e1ximo sem OI)', min: 85, max: 200 },
];

/**
 * Roda o motor de score do radar contra o histórico real, igual já fazemos
 * com as 6 estratégias curadas — pra responder a pergunta que importa:
 * score alto realmente correlaciona com profit factor melhor, ou é só uma
 * fórmula que parece bonita no papel?
 *
 * IMPORTANTE: o histórico de Open Interest da Binance não cobre períodos
 * longos (~30 dias no máximo) — esse backtest calcula o score SEM o
 * componente de OI (15 pts). O máximo possível aqui é 85, não 100. O OI só
 * pode ser validado observando o robô rodando ao vivo por enquanto.
 */
export async function backtestRadarScore(params: {
  pair: string;
  timeframe: string;
  months: number;
}): Promise<RadarBacktestResult> {
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

  const fundingSeries = (await getHistoricalFundingRates(pair, fetchStart, endTime))
    .map((f) => ({ time: f.fundingTime, rate: parseFloat(f.fundingRate ?? '0') }))
    .sort((a, b) => a.time - b.time);

  const trades: ScoredBacktestTrade[] = [];
  const gap = dedupCandleGap(timeframe);
  let lastIdx = -Infinity;
  let fundingIdx = 0;
  let resPointer = 0;
  let totalScored = 0;

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

    totalScored++;

    const fullyAligned = regimeResult.regime === 'ALTA' || regimeResult.regime === 'BAIXA';
    const trendScore = fullyAligned ? 25 : Math.round(25 * regimeResult.force);

    const closes = window.map((k) => k.close);
    const macd = calcMACD(closes);
    const roc = calcROC(closes);
    const macdAligned = macd ? (direction === 'LONG' ? macd.histogram > 0 : macd.histogram < 0) : false;
    const rocAligned = roc !== null ? (direction === 'LONG' ? roc > 0 : roc < 0) : false;
    const momentumScore = macdAligned && rocAligned ? 20 : macdAligned || rocAligned ? 10 : 0;

    const last = window[window.length - 1];
    const prevVols = window.slice(-11, -1).map((k) => k.volume);
    const avgVol = prevVols.reduce((a, b) => a + b, 0) / (prevVols.length || 1);
    const volumeScore = avgVol > 0 && last.volume > avgVol * 1.3 ? 15 : 0;

    let fundingRate = 0;
    if (fundingSeries.length) {
      while (fundingIdx < fundingSeries.length - 1 && fundingSeries[fundingIdx + 1].time <= last.closeTime) {
        fundingIdx++;
      }
      fundingRate = fundingSeries[fundingIdx]?.rate ?? 0;
    }
    const fundingOk = direction === 'LONG' ? fundingRate < 0.001 : fundingRate > -0.0005;
    const fundingScore = fundingOk ? 10 : 0;

    const liquidityScore = regimeResult.hasQuality ? 5 : 0;

    // Níveis — mesma régua do lib/radar-score.ts (nunca inclui o candle
    // atual no swing, mesmo cuidado do bug do Rompimento de Range).
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
    const riskRewardScore = 10; // sempre 1.5:1 por construção

    const score = trendScore + momentumScore + volumeScore + fundingScore + riskRewardScore + liquidityScore;

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
      score,
      status: outcome.status,
      pnlPercent: outcome.pnlPercent,
    });
    lastIdx = i;
  }

  const toTradeLikes = (list: ScoredBacktestTrade[]): TradeLike[] =>
    list.map((t) => ({ pair, timeframe, status: t.status, pnlPercent: t.pnlPercent, createdAt: t.entryTime, closedAt: t.closedAt }));

  const bins: ScoreBin[] = SCORE_BIN_DEFS.map((b) => ({
    ...b,
    metrics: computeMetrics(toTradeLikes(trades.filter((t) => t.score >= b.min && t.score <= b.max))),
  }));

  return {
    pair,
    timeframe,
    totalCandidatesScored: totalScored,
    trades,
    bins,
    overallMetrics: computeMetrics(toTradeLikes(trades)),
    periodStart: new Date(periodStart),
    periodEnd: new Date(endTime),
    note: 'Score calculado sem o componente de Open Interest (15 pts) — o histórico da Binance não cobre per\u00edodos longos o suficiente. M\u00e1ximo poss\u00edvel aqui \u00e9 85, n\u00e3o 100.',
  };
}
