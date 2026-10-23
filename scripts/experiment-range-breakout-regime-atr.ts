/**
 * EXPERIMENTO — não wireado em produção, não muda lib/strategies.ts nem
 * lib/analysis-engine.ts.
 *
 * Continuação de scripts/experiment-range-breakout-atr-filter.ts: aquele
 * testou o filtro de ATR (atrRatio > 1.3) ISOLADO, sem o filtro de regime
 * que já roda ao vivo (LATERALIZACAO-only em 1h/15m, ver
 * REGIME_GATED_STRATEGIES_BY_TF em lib/analysis-engine.ts). Resultado:
 * ganho real mas modesto (PF médio 0.84→0.89), piora em 3 de 10 combos.
 *
 * Este script testa 4 variantes lado a lado pra cada par/timeframe:
 *   1. baseline        — rompimento original, sem filtro nenhum
 *   2. regime          — só o filtro de regime (réplica exata de
 *                        passesLiveRegimeGate: classifyRegime em klines
 *                        de 1h, libera só em LATERALIZACAO)
 *   3. atr             — só o filtro de ATR local (atrRatio > 1.3 no
 *                        timeframe da própria estratégia)
 *   4. regime+atr       — os dois juntos (o que rodaria de verdade se a
 *                        mudança fosse promovida)
 *
 * BCHUSDT excluído (já decidido — PF 0.28 em qualquer variante, ver
 * scripts/exclude-bchusdt-strategy1.ts).
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/experiment-range-breakout-regime-atr.ts
 */
import { getHistoricalKlines, Kline } from '../lib/binance';
import { calcATR } from '../lib/indicators';
import { stopTierMultiplier, detectRangeBreakout } from '../lib/strategies';
import { classifyRegime } from '../lib/regime';
import { regimeAllowsStrategy } from '../lib/radar-context';
import {
  simulateOutcome, dedupCandleGap, minutesForTimeframe,
  RESOLUTION_INTERVAL, RESOLUTION_LOOKAHEAD_CANDLES,
} from '../lib/backtest-engine';
import { computeMetrics, TradeLike } from '../lib/metrics';

const ATR_EXPANSION_THRESHOLD = 1.3;
const STRATEGY_ID = 1;
const REGIME_KLINES_NEEDED = 300; // mesmo N de passesLiveRegimeGate (getKlines(pair,'1h',300))
const REGIME_BUFFER_CANDLES = 300 + 10; // folga extra pro ponteiro nunca faltar candle no início

interface Sig { direction: 'LONG' | 'SHORT'; entryPrice: number; target1: number; stopLoss: number; }

function detectBaseline(window: Kline[], pair: string, timeframe: string): Sig | null {
  const d = detectRangeBreakout(window, pair, timeframe);
  if (!d || d.direction !== 'LONG') return null;
  return { direction: d.direction, entryPrice: d.entryPrice, target1: d.target1, stopLoss: d.stopLoss };
}

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
  if (!breakUp) return null; // só LONG

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

interface VariantMetrics { n: number; pf: number; exp: number; }

async function runCombo(pair: string, timeframe: string, months: number) {
  const endTime = Date.now();
  const periodStart = endTime - months * 30 * 24 * 60 * 60 * 1000;
  const required = 30;
  const lookbackMs = required * minutesForTimeframe(timeframe) * 60 * 1000;
  const fetchStart = periodStart - lookbackMs;

  const detectionKlines = await getHistoricalKlines(pair, timeframe, fetchStart, endTime);
  const resolutionKlines = timeframe === RESOLUTION_INTERVAL
    ? detectionKlines
    : await getHistoricalKlines(pair, RESOLUTION_INTERVAL, fetchStart, endTime);

  // Klines de 1h dedicadas pro filtro de regime, com folga extra ANTES de
  // fetchStart pra classifyRegime sempre ter 300 candles disponíveis já
  // no primeiro sinal candidato (réplica fiel de getKlines(pair,'1h',300)
  // no momento exato de cada sinal, não um snapshot único).
  const regimeFetchStart = fetchStart - REGIME_BUFFER_CANDLES * 60 * 60 * 1000;
  const regimeKlines1h = await getHistoricalKlines(pair, '1h', regimeFetchStart, endTime);

  function regimeAllowsAt(entryTime: number, regimePtr: { i: number }): boolean {
    while (regimePtr.i < regimeKlines1h.length && regimeKlines1h[regimePtr.i].closeTime <= entryTime) regimePtr.i++;
    const endIdx = regimePtr.i; // primeiro candle 1h fechado DEPOIS da entrada — usamos até o anterior
    const startIdx = Math.max(0, endIdx - REGIME_KLINES_NEEDED);
    const window1h = regimeKlines1h.slice(startIdx, endIdx);
    const classification = classifyRegime(window1h);
    if (!classification) return false;
    return regimeAllowsStrategy(classification, STRATEGY_ID);
  }

  function runLoop(detect: (window: Kline[]) => Sig | null, useRegimeGate: boolean) {
    const trades: { status: 'WIN' | 'LOSS'; pnlPercent: number; entryTime: Date; closedAt: Date }[] = [];
    const dedupGap = dedupCandleGap(timeframe);
    let lastTradeIndex = -Infinity;
    let resPointer = 0;
    const regimePtr = { i: 0 };

    for (let i = required - 1; i < detectionKlines.length; i++) {
      if (i - lastTradeIndex < dedupGap) continue;
      const window = detectionKlines.slice(i - required + 1, i + 1);
      const signal = detect(window);
      if (!signal) continue;

      const entryTime = detectionKlines[i].closeTime;

      if (useRegimeGate && !regimeAllowsAt(entryTime, regimePtr)) continue;

      while (resPointer < resolutionKlines.length && resolutionKlines[resPointer].closeTime <= entryTime) resPointer++;
      const outcome = simulateOutcome(signal, resolutionKlines, resPointer, RESOLUTION_LOOKAHEAD_CANDLES);
      if (!outcome) continue;

      trades.push({ status: outcome.status, pnlPercent: outcome.pnlPercent, entryTime: new Date(entryTime), closedAt: outcome.closedAt });
      lastTradeIndex = i;
    }
    return trades;
  }

  const variants: Record<string, { status: 'WIN' | 'LOSS'; pnlPercent: number; entryTime: Date; closedAt: Date }[]> = {
    baseline: runLoop((w) => detectBaseline(w, pair, timeframe), false),
    regime: runLoop((w) => detectBaseline(w, pair, timeframe), true),
    atr: runLoop((w) => detectAtrFiltered(w, pair), false),
    'regime+atr': runLoop((w) => detectAtrFiltered(w, pair), true),
  };

  const metrics: Record<string, VariantMetrics> = {};
  for (const [name, trades] of Object.entries(variants)) {
    const m = computeMetrics(tradesToTradeLikes(pair, timeframe, trades));
    metrics[name] = { n: trades.length, pf: m.profitFactor, exp: m.expectancy };
  }
  return metrics;
}

const COMBOS: Array<{ pair: string; timeframe: string }> = [
  { pair: 'BTCUSDT', timeframe: '1h' }, { pair: 'BTCUSDT', timeframe: '15m' },
  { pair: 'ETHUSDT', timeframe: '1h' }, { pair: 'ETHUSDT', timeframe: '15m' },
  { pair: 'BNBUSDT', timeframe: '1h' }, { pair: 'BNBUSDT', timeframe: '15m' },
  { pair: 'XRPUSDT', timeframe: '1h' },
  { pair: 'LINKUSDT', timeframe: '1h' },
  { pair: 'AVAXUSDT', timeframe: '1h' },
];

function fmt(m: VariantMetrics): string {
  return `n=${String(m.n).padEnd(3)} PF=${m.pf.toFixed(2).padEnd(5)} exp=${m.exp.toFixed(3)}`;
}

async function main() {
  console.log('Backtest 6 meses — 4 variantes, só LONG (BCHUSDT excluído):\n');

  const totals: Record<string, { n: number; pfs: number[] }> = {
    baseline: { n: 0, pfs: [] }, regime: { n: 0, pfs: [] }, atr: { n: 0, pfs: [] }, 'regime+atr': { n: 0, pfs: [] },
  };

  for (const c of COMBOS) {
    try {
      const m = await runCombo(c.pair, c.timeframe, 6);
      console.log(`${c.pair} × ${c.timeframe}`);
      console.log(`  baseline:    ${fmt(m.baseline)}`);
      console.log(`  regime:      ${fmt(m.regime)}`);
      console.log(`  atr:         ${fmt(m.atr)}`);
      console.log(`  regime+atr:  ${fmt(m['regime+atr'])}`);
      console.log('');
      for (const key of Object.keys(totals)) {
        totals[key].n += m[key].n;
        if (m[key].n > 0) totals[key].pfs.push(m[key].pf);
      }
    } catch (e: any) {
      console.log(`${c.pair} × ${c.timeframe}: ERRO ${e?.message}\n`);
    }
  }

  console.log('='.repeat(60));
  console.log('RESUMO (média simples de PF por combo, n total de trades):');
  for (const [key, t] of Object.entries(totals)) {
    const avgPf = t.pfs.length ? t.pfs.reduce((a, b) => a + b, 0) / t.pfs.length : NaN;
    console.log(`  ${key.padEnd(12)} n_total=${t.n} PF_medio=${avgPf.toFixed(2)}`);
  }
}

main().catch((e) => {
  console.error('[experiment] Falha:', e?.message ?? e);
  process.exit(1);
});
