/**
 * EXPERIMENTO — não wireado em produção, não muda lib/strategies.ts.
 *
 * Testa a hipótese levantada na auditoria de 23/10/2026: nos 10 trades
 * mais recentes da Estratégia 1 (LONG, 1h/15m) em regime LATERALIZACAO
 * (exatamente o regime que o filtro de regime já restringe), 0% WR,
 * -2.10%/trade — e o atrRatio no momento do sinal (expansão de
 * volatilidade recente vs normal) ficou sempre perto de 1.0 (0.78 a
 * 1.22), nunca acima do limiar de "expansão real" que o próprio projeto
 * usa em outro lugar (1.3, ver VOLATILITY_EXPANSION_RATIO em
 * lib/regime.ts e a Compressão de Volatilidade). Hipótese: esses
 * rompimentos são fakeouts — o preço cruza o range dos últimos 20
 * candles sem volatilidade de verdade sustentando o movimento.
 *
 * A variante aqui muda SÓ isso: exige atrRatio > 1.3 (mesmo cálculo e
 * mesmo limiar de lib/regime.ts) além do rompimento de preço+volume que
 * já existia. Stop, alvo, filtro de consolidação (4%) e filtro de volume
 * (1.5x) ficam IDÊNTICOS ao original, pra isolar o que está sendo
 * testado.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/experiment-range-breakout-atr-filter.ts
 */
import { getHistoricalKlines, Kline } from '../lib/binance';
import { calcATR } from '../lib/indicators';
import { stopTierMultiplier, detectRangeBreakout, DetectedSignal } from '../lib/strategies';
import {
  simulateOutcome, dedupCandleGap, minutesForTimeframe,
  RESOLUTION_INTERVAL, RESOLUTION_LOOKAHEAD_CANDLES,
} from '../lib/backtest-engine';
import { computeMetrics, TradeLike } from '../lib/metrics';

const ATR_EXPANSION_THRESHOLD = 1.3; // mesmo limiar de lib/regime.ts (VOLATILITY_EXPANSION_RATIO)

interface ExperimentSignal {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  target1: number;
  stopLoss: number;
}

// Cópia de detectRangeBreakout (lib/strategies.ts) com UMA mudança: exige
// atrRatio > 1.3 (mesmo cálculo de lib/regime.ts: ATR recente de 5
// candles vs ATR normal de 14 candles, excluindo os 5 mais recentes)
// além do rompimento de preço+volume original.
function detectRangeBreakoutAtrFiltered(klines: Kline[], pair: string): ExperimentSignal | null {
  if ((klines?.length ?? 0) < 30) return null;

  const recent = klines.slice(-21, -1);
  const highs = recent.map((k) => k?.high ?? 0);
  const lows = recent.map((k) => k?.low ?? 0);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangeSize = rangeHigh - rangeLow;
  const avgRange = rangeSize / rangeHigh;
  if (avgRange > 0.04) return null;

  const last = klines[klines.length - 1];
  const prevVols = klines.slice(-10, -1).map((k) => k?.volume ?? 0);
  const avgVol = prevVols.reduce((a, b) => a + b, 0) / (prevVols.length || 1);
  if (!last) return null;

  const breakUp = last.close > rangeHigh && last.volume > avgVol * 1.5;
  const breakDown = last.close < rangeLow && last.volume > avgVol * 1.5;
  if (!breakUp && !breakDown) return null;

  // ÚNICO GATE NOVO vs original: exige expansão real de volatilidade.
  const atrNormal = calcATR(klines.slice(0, -5), 14);
  const atrRecent = calcATR(klines.slice(-10), 5);
  const atrRatio = atrNormal > 0 ? atrRecent / atrNormal : 1;
  if (atrRatio <= ATR_EXPANSION_THRESHOLD) return null;

  const dir: 'LONG' | 'SHORT' = breakUp ? 'LONG' : 'SHORT';
  const entry = last.close;
  const atr = calcATR(klines);
  const mult = stopTierMultiplier(pair);
  const stopLoss = dir === 'LONG' ? rangeLow - atr * 0.5 * mult : rangeHigh + atr * 0.5 * mult;
  const riskDistance = Math.abs(entry - stopLoss);

  return {
    direction: dir,
    entryPrice: entry,
    target1: dir === 'LONG' ? entry + riskDistance * 1.5 : entry - riskDistance * 1.5,
    stopLoss,
  };
}

function tradesToTradeLikes(pair: string, timeframe: string, trades: { status: 'WIN' | 'LOSS'; pnlPercent: number; entryTime: Date; closedAt: Date }[]): TradeLike[] {
  return trades.map((t) => ({ pair, timeframe, status: t.status, pnlPercent: t.pnlPercent, createdAt: t.entryTime, closedAt: t.closedAt }));
}

interface ComboResult {
  pair: string; timeframe: string;
  baselineN: number; baselinePF: number; baselineExp: number;
  variantN: number; variantPF: number; variantExp: number;
}

async function runCombo(pair: string, timeframe: string, months: number): Promise<ComboResult> {
  const endTime = Date.now();
  const periodStart = endTime - months * 30 * 24 * 60 * 60 * 1000;
  const required = 30;
  const lookbackMs = required * minutesForTimeframe(timeframe) * 60 * 1000;
  const fetchStart = periodStart - lookbackMs;

  const detectionKlines = await getHistoricalKlines(pair, timeframe, fetchStart, endTime);
  const resolutionKlines = timeframe === RESOLUTION_INTERVAL
    ? detectionKlines
    : await getHistoricalKlines(pair, RESOLUTION_INTERVAL, fetchStart, endTime);

  function runLoop(detect: (window: Kline[]) => ExperimentSignal | null) {
    const trades: { status: 'WIN' | 'LOSS'; pnlPercent: number; entryTime: Date; closedAt: Date }[] = [];
    const dedupGap = dedupCandleGap(timeframe);
    let lastTradeIndex = -Infinity;
    let resPointer = 0;

    for (let i = required - 1; i < detectionKlines.length; i++) {
      if (i - lastTradeIndex < dedupGap) continue;
      const window = detectionKlines.slice(i - required + 1, i + 1);
      const signal = detect(window);
      if (!signal) continue;

      const entryTime = detectionKlines[i].closeTime;
      while (resPointer < resolutionKlines.length && resolutionKlines[resPointer].closeTime <= entryTime) resPointer++;

      const outcome = simulateOutcome(signal, resolutionKlines, resPointer, RESOLUTION_LOOKAHEAD_CANDLES);
      if (!outcome) continue;

      trades.push({ status: outcome.status, pnlPercent: outcome.pnlPercent, entryTime: new Date(entryTime), closedAt: outcome.closedAt });
      lastTradeIndex = i;
    }
    return trades;
  }

  const baselineTrades = runLoop((window) => {
    const d: DetectedSignal | null = detectRangeBreakout(window, pair, timeframe);
    if (!d || d.direction !== 'LONG') return null; // isola LONG, igual à config atual (SHORT bloqueado)
    return { direction: d.direction, entryPrice: d.entryPrice, target1: d.target1, stopLoss: d.stopLoss };
  });
  const variantTrades = runLoop((window) => {
    const s = detectRangeBreakoutAtrFiltered(window, pair);
    if (!s || s.direction !== 'LONG') return null;
    return s;
  });

  const baseM = computeMetrics(tradesToTradeLikes(pair, timeframe, baselineTrades));
  const varM = computeMetrics(tradesToTradeLikes(pair, timeframe, variantTrades));

  return {
    pair, timeframe,
    baselineN: baselineTrades.length, baselinePF: baseM.profitFactor, baselineExp: baseM.expectancy,
    variantN: variantTrades.length, variantPF: varM.profitFactor, variantExp: varM.expectancy,
  };
}

const COMBOS: Array<{ pair: string; timeframe: string }> = [
  { pair: 'BTCUSDT', timeframe: '1h' }, { pair: 'BTCUSDT', timeframe: '15m' },
  { pair: 'ETHUSDT', timeframe: '1h' }, { pair: 'ETHUSDT', timeframe: '15m' },
  { pair: 'BNBUSDT', timeframe: '1h' }, { pair: 'BNBUSDT', timeframe: '15m' },
  { pair: 'XRPUSDT', timeframe: '1h' },
  { pair: 'LINKUSDT', timeframe: '1h' },
  { pair: 'BCHUSDT', timeframe: '1h' },
  { pair: 'AVAXUSDT', timeframe: '1h' },
];

async function main() {
  console.log(`Backtest 6 meses — baseline (atual) vs variante (atrRatio > ${ATR_EXPANSION_THRESHOLD}), só LONG, mesmo stop/alvo/consolidação/volume.\n`);
  console.log(`${'Par'.padEnd(10)} ${'TF'.padEnd(5)} | ${'Baseline n/PF/exp%'.padEnd(26)} | ${'Variante n/PF/exp%'.padEnd(26)}`);
  console.log('-'.repeat(75));

  let totalBaseN = 0, totalVarN = 0;
  const baseAllPF: number[] = [], varAllPF: number[] = [];

  for (const c of COMBOS) {
    try {
      const r = await runCombo(c.pair, c.timeframe, 6);
      console.log(
        `${r.pair.padEnd(10)} ${r.timeframe.padEnd(5)} | n=${String(r.baselineN).padEnd(3)} PF=${r.baselinePF.toFixed(2).padEnd(5)} exp=${r.baselineExp.toFixed(3).padEnd(7)} | n=${String(r.variantN).padEnd(3)} PF=${r.variantPF.toFixed(2).padEnd(5)} exp=${r.variantExp.toFixed(3)}`
      );
      totalBaseN += r.baselineN; totalVarN += r.variantN;
      if (r.baselineN > 0) baseAllPF.push(r.baselinePF);
      if (r.variantN > 0) varAllPF.push(r.variantPF);
    } catch (e: any) {
      console.log(`${c.pair.padEnd(10)} ${c.timeframe.padEnd(5)} | ERRO: ${e?.message}`);
    }
  }

  console.log('-'.repeat(75));
  console.log(`\nTotal de trades -- baseline: ${totalBaseN} | variante: ${totalVarN} (filtro reduziu volume em ${totalBaseN ? ((1 - totalVarN / totalBaseN) * 100).toFixed(0) : 0}%)`);
  console.log(`PF médio simples por combo -- baseline: ${(baseAllPF.reduce((a,b)=>a+b,0)/(baseAllPF.length||1)).toFixed(2)} | variante: ${(varAllPF.reduce((a,b)=>a+b,0)/(varAllPF.length||1)).toFixed(2)}`);
}

main().catch((e) => {
  console.error('[experiment] Falha:', e?.message ?? e);
  process.exit(1);
});
