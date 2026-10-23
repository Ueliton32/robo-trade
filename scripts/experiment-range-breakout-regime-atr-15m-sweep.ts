/**
 * EXPERIMENTO — não wireado em produção.
 *
 * Continuação de scripts/experiment-range-breakout-regime-atr.ts: aquele
 * testou 4 variantes em 9 combos e achou que `regime+atr` em 15m foi a
 * melhor variante nos 3 pares testados (BTC/ETH/BNB, PF 1.22-1.27,
 * n=21-33). Este script roda SÓ a variante `regime+atr` em 15m pros
 * pares restantes do portfólio monitorado, pra ver se o padrão se
 * mantém ou se foi específico desses 3 pares. BCHUSDT fica de fora
 * (já excluído — ver scripts/exclude-bchusdt-strategy1.ts).
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/experiment-range-breakout-regime-atr-15m-sweep.ts
 */
import { getHistoricalKlines, Kline } from '../lib/binance';
import { calcATR } from '../lib/indicators';
import { stopTierMultiplier } from '../lib/strategies';
import { classifyRegime } from '../lib/regime';
import { regimeAllowsStrategy } from '../lib/radar-context';
import {
  simulateOutcome, dedupCandleGap, minutesForTimeframe,
  RESOLUTION_INTERVAL, RESOLUTION_LOOKAHEAD_CANDLES,
} from '../lib/backtest-engine';
import { computeMetrics, TradeLike } from '../lib/metrics';

const ATR_EXPANSION_THRESHOLD = 1.3;
const STRATEGY_ID = 1;
const TIMEFRAME = '15m';
const REGIME_KLINES_NEEDED = 300;
const REGIME_BUFFER_CANDLES = 310;

interface Sig { direction: 'LONG'; entryPrice: number; target1: number; stopLoss: number; }

function detectAtrFiltered(window: Kline[], pair: string): Sig | null {
  if ((window?.length ?? 0) < 30) return null;
  const recent = window.slice(-21, -1);
  const highs = recent.map((k) => k?.high ?? 0);
  const lows = recent.map((k) => k?.low ?? 0);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangeSize = rangeHigh - rangeLow;
  const avgRange = rangeSize / rangeHigh;
  if (avgRange > 0.04) return null;

  const last = window[window.length - 1];
  const prevVols = window.slice(-10, -1).map((k) => k?.volume ?? 0);
  const avgVol = prevVols.reduce((a, b) => a + b, 0) / (prevVols.length || 1);
  if (!last) return null;

  const breakUp = last.close > rangeHigh && last.volume > avgVol * 1.5;
  if (!breakUp) return null;

  const atrNormal = calcATR(window.slice(0, -5), 14);
  const atrRecent = calcATR(window.slice(-10), 5);
  const atrRatio = atrNormal > 0 ? atrRecent / atrNormal : 1;
  if (atrRatio <= ATR_EXPANSION_THRESHOLD) return null;

  const entry = last.close;
  const atr = calcATR(window);
  const mult = stopTierMultiplier(pair);
  const stopLoss = rangeLow - atr * 0.5 * mult;
  const riskDistance = Math.abs(entry - stopLoss);

  return { direction: 'LONG', entryPrice: entry, target1: entry + riskDistance * 1.5, stopLoss };
}

function tradesToTradeLikes(pair: string, timeframe: string, trades: { status: 'WIN' | 'LOSS'; pnlPercent: number; entryTime: Date; closedAt: Date }[]): TradeLike[] {
  return trades.map((t) => ({ pair, timeframe, status: t.status, pnlPercent: t.pnlPercent, createdAt: t.entryTime, closedAt: t.closedAt }));
}

async function runCombo(pair: string, months: number) {
  const endTime = Date.now();
  const periodStart = endTime - months * 30 * 24 * 60 * 60 * 1000;
  const required = 30;
  const lookbackMs = required * minutesForTimeframe(TIMEFRAME) * 60 * 1000;
  const fetchStart = periodStart - lookbackMs;

  const detectionKlines = await getHistoricalKlines(pair, TIMEFRAME, fetchStart, endTime);
  const resolutionKlines = detectionKlines; // TIMEFRAME já é 15m = RESOLUTION_INTERVAL

  const regimeFetchStart = fetchStart - REGIME_BUFFER_CANDLES * 60 * 60 * 1000;
  const regimeKlines1h = await getHistoricalKlines(pair, '1h', regimeFetchStart, endTime);

  function regimeAllowsAt(entryTime: number, regimePtr: { i: number }): boolean {
    while (regimePtr.i < regimeKlines1h.length && regimeKlines1h[regimePtr.i].closeTime <= entryTime) regimePtr.i++;
    const endIdx = regimePtr.i;
    const startIdx = Math.max(0, endIdx - REGIME_KLINES_NEEDED);
    const window1h = regimeKlines1h.slice(startIdx, endIdx);
    const classification = classifyRegime(window1h);
    if (!classification) return false;
    return regimeAllowsStrategy(classification, STRATEGY_ID);
  }

  const trades: { status: 'WIN' | 'LOSS'; pnlPercent: number; entryTime: Date; closedAt: Date }[] = [];
  const dedupGap = dedupCandleGap(TIMEFRAME);
  let lastTradeIndex = -Infinity;
  let resPointer = 0;
  const regimePtr = { i: 0 };

  for (let i = required - 1; i < detectionKlines.length; i++) {
    if (i - lastTradeIndex < dedupGap) continue;
    const window = detectionKlines.slice(i - required + 1, i + 1);
    const signal = detectAtrFiltered(window, pair);
    if (!signal) continue;

    const entryTime = detectionKlines[i].closeTime;
    if (!regimeAllowsAt(entryTime, regimePtr)) continue;

    while (resPointer < resolutionKlines.length && resolutionKlines[resPointer].closeTime <= entryTime) resPointer++;
    const outcome = simulateOutcome(signal, resolutionKlines, resPointer, RESOLUTION_LOOKAHEAD_CANDLES);
    if (!outcome) continue;

    trades.push({ status: outcome.status, pnlPercent: outcome.pnlPercent, entryTime: new Date(entryTime), closedAt: outcome.closedAt });
    lastTradeIndex = i;
  }

  const m = computeMetrics(tradesToTradeLikes(pair, TIMEFRAME, trades));
  return { n: trades.length, pf: m.profitFactor, exp: m.expectancy, winRate: m.winRate };
}

// Pares monitorados restantes (exclui BTC/ETH/BNB já testados e BCHUSDT já excluído).
const PAIRS = [
  'XRPUSDT', 'ADAUSDT', 'SUIUSDT', 'AVAXUSDT', 'LINKUSDT', 'LTCUSDT',
  'TRXUSDT', 'XLMUSDT', 'TAOUSDT', 'WLDUSDT', 'ZECUSDT', '1000PEPEUSDT',
  'DOTUSDT', 'UNIUSDT',
];

async function main() {
  console.log(`Backtest 6 meses — só regime+atr, 15m, ${PAIRS.length} pares restantes:\n`);
  console.log(`${'Par'.padEnd(14)} n     PF     WR%      exp%`);
  console.log('-'.repeat(50));

  const pfs: number[] = [];
  let totalN = 0;

  for (const pair of PAIRS) {
    try {
      const r = await runCombo(pair, 6);
      console.log(`${pair.padEnd(14)} ${String(r.n).padEnd(6)} ${r.pf.toFixed(2).padEnd(6)} ${r.winRate.toFixed(1).padEnd(8)} ${r.exp.toFixed(3)}`);
      if (r.n > 0) { pfs.push(r.pf); totalN += r.n; }
    } catch (e: any) {
      console.log(`${pair.padEnd(14)} ERRO: ${e?.message}`);
    }
  }

  console.log('-'.repeat(50));
  const avgPf = pfs.length ? pfs.reduce((a, b) => a + b, 0) / pfs.length : NaN;
  const above1 = pfs.filter((p) => p > 1).length;
  console.log(`\nn_total=${totalN} | PF médio por par=${avgPf.toFixed(2)} | pares com PF>1: ${above1}/${pfs.length}`);
}

main().catch((e) => {
  console.error('[experiment] Falha:', e?.message ?? e);
  process.exit(1);
});
