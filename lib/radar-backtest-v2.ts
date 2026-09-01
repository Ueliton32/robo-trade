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

/**
 * Score v2 — hipótese invertida, testada em 10/08/2026 depois que a v1
 * mostrou o padrão oposto do esperado (score alto = profit factor pior,
 * consistente em 4 de 5 moedas testadas via lib/radar-backtest.ts).
 *
 * Muda SÓ 3 coisas, tudo o resto (funding, risco/retorno, liquidez,
 * resolução, dedup) fica idêntico à v1 — pra deixar claro depois o que
 * realmente causou a diferença, se houver:
 *
 *   1. Tendência: regime "em correção" (pullback) agora vale o máximo;
 *      regime totalmente alinhado vale menos (pode já estar atrasado).
 *   2. Momentum: alinhado mas com ROC esticado demais = risco de exaustão,
 *      não confirmação — pontuação bem menor.
 *   3. Volume: pico exagerado (não só "acima do normal") também tratado
 *      como possível clímax, não força saudável.
 */

const REGIME_MIN_KLINES = 210;
const REGIME_WINDOW = 300;

const ROC_EXHAUSTION_THRESHOLD = 8; // % — acima disso, movimento já esticado
const VOLUME_EXHAUSTION_RATIO = 2.5; // acima disso, pico grande demais pra ser "saudável"

export interface ScoredBacktestTradeV2 {
  entryTime: Date;
  closedAt: Date;
  direction: 'LONG' | 'SHORT';
  score: number; // 0 a 85, mesma escala da v1 (sem Open Interest)
  status: 'WIN' | 'LOSS';
  pnlPercent: number;
}

export interface ScoreBinV2 {
  label: string;
  min: number;
  max: number;
  metrics: ComputedMetrics;
}

export interface RadarBacktestV2Result {
  pair: string;
  timeframe: string;
  totalCandidatesScored: number;
  trades: ScoredBacktestTradeV2[];
  bins: ScoreBinV2[];
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

export async function backtestRadarScoreV2(params: {
  pair: string;
  timeframe: string;
  months: number;
}): Promise<RadarBacktestV2Result> {
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

  const trades: ScoredBacktestTradeV2[] = [];
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

    // ── 1. Tendência (25 pts) — INVERTIDO: correção vale mais que alinhado ──
    const isCorrecao = regimeResult.regime === 'ALTA_CORRECAO' || regimeResult.regime === 'BAIXA_CORRECAO';
    const trendScore = isCorrecao ? 25 : 10;

    // ── 2. Momentum (20 pts) — alinhado mas esticado = exaustão, não força ──
    const closes = window.map((k) => k.close);
    const macd = calcMACD(closes);
    const roc = calcROC(closes);
    const macdAligned = macd ? (direction === 'LONG' ? macd.histogram > 0 : macd.histogram < 0) : false;
    const rocAligned = roc !== null ? (direction === 'LONG' ? roc > 0 : roc < 0) : false;
    const rocStretched = roc !== null && Math.abs(roc) > ROC_EXHAUSTION_THRESHOLD;

    let momentumScore = 0;
    if (macdAligned && rocAligned) {
      momentumScore = rocStretched ? 5 : 20;
    } else if (macdAligned || rocAligned) {
      momentumScore = 10;
    }

    // ── 3. Volume (15 pts) — pico exagerado também tratado com cautela ──────
    const last = window[window.length - 1];
    const prevVols = window.slice(-11, -1).map((k) => k.volume);
    const avgVol = prevVols.reduce((a, b) => a + b, 0) / (prevVols.length || 1);
    const volRatio = avgVol > 0 ? last.volume / avgVol : 0;
    let volumeScore = 0;
    if (volRatio > 1.3) {
      volumeScore = volRatio > VOLUME_EXHAUSTION_RATIO ? 5 : 15;
    }

    // ── Funding, Risco/Retorno, Liquidez — idênticos à v1 ───────────────────
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
    const riskRewardScore = 10;

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

  const toTradeLikes = (list: ScoredBacktestTradeV2[]): TradeLike[] =>
    list.map((t) => ({ pair, timeframe, status: t.status, pnlPercent: t.pnlPercent, createdAt: t.entryTime, closedAt: t.closedAt }));

  const bins: ScoreBinV2[] = SCORE_BIN_DEFS.map((b) => ({
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
    note: 'Vers\u00e3o 2 (hip\u00f3tese invertida): correção vale mais que alinhamento total; momentum e volume esticados demais contam como risco de exaust\u00e3o, n\u00e3o confirma\u00e7\u00e3o. Funding, risco/retorno e liquidez id\u00eanticos \u00e0 v1. Tamb\u00e9m sem Open Interest (m\u00e1ximo 85, n\u00e3o 100).',
  };
}
