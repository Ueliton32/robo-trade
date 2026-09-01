/**
 * EXPERIMENTO — não wireado em produção, não muda lib/strategies.ts.
 *
 * Testa uma hipótese pontual sobre por que "Rompimento de Range"
 * (estratégia 1) apareceu instável em 5 de 7 pares no stability-scan de
 * 14/08/2026 (ver conversa): o alvo hoje é `riskDistance * 1.5` / `* 3`
 * (múltiplo da distância até o stop), não relacionado ao tamanho real da
 * consolidação que acabou de romper. Numa consolidação apertada (≤4% do
 * preço), isso pode pedir um movimento desproporcional ao range original
 * pra bater o alvo — funciona só quando o sub-período tem continuação
 * forte, o que bate com o padrão visto (pedaços oscilando PF 2-4x vs
 * 0.5-0.6x).
 *
 * A variante aqui muda SÓ o alvo — measured move (altura do range
 * projetada a partir do rompimento, técnica clássica de range breakout)
 * em vez de múltiplo do risco. Stop, filtro de consolidação (4%) e filtro
 * de volume (1.5x) ficam IDÊNTICOS ao original, pra isolar o que está
 * sendo testado.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/experiment-range-breakout-target.ts
 */
import { getHistoricalKlines, Kline } from '../lib/binance';
import { calcATR } from '../lib/indicators';
import { stopTierMultiplier } from '../lib/strategies';
import {
  simulateOutcome, dedupCandleGap, minutesForTimeframe,
  RESOLUTION_INTERVAL, RESOLUTION_LOOKAHEAD_CANDLES,
} from '../lib/backtest-engine';
import { computeMetrics, TradeLike } from '../lib/metrics';

interface ExperimentSignal {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  target1: number;
  stopLoss: number;
}

// Cópia de detectRangeBreakout (lib/strategies.ts) com UMA mudança: alvo
// por measured move em vez de múltiplo do risco. Tudo o resto idêntico.
function detectMeasuredMove(klines: Kline[], pair: string): ExperimentSignal | null {
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

  const dir: 'LONG' | 'SHORT' = breakUp ? 'LONG' : 'SHORT';
  const entry = last.close;
  const atr = calcATR(klines);
  const mult = stopTierMultiplier(pair);
  const stopLoss = dir === 'LONG' ? rangeLow - atr * 0.5 * mult : rangeHigh + atr * 0.5 * mult;

  // ÚNICA MUDANÇA vs original: alvo = altura do range projetada a partir
  // do ponto de rompimento (measured move), não riskDistance * 1.5.
  const target1 = dir === 'LONG' ? entry + rangeSize : entry - rangeSize;

  return { direction: dir, entryPrice: entry, target1, stopLoss };
}

function tradesToTradeLikes(pair: string, timeframe: string, trades: { status: 'WIN' | 'LOSS'; pnlPercent: number; entryTime: Date; closedAt: Date }[]): TradeLike[] {
  return trades.map((t) => ({ pair, timeframe, status: t.status, pnlPercent: t.pnlPercent, createdAt: t.entryTime, closedAt: t.closedAt }));
}

async function runExperiment(pair: string, timeframe: string, months: number) {
  const endTime = Date.now();
  const periodStart = endTime - months * 30 * 24 * 60 * 60 * 1000;
  const required = 30; // mesmo mínimo do detectRangeBreakout original
  const lookbackMs = required * minutesForTimeframe(timeframe) * 60 * 1000;
  const fetchStart = periodStart - lookbackMs;

  const detectionKlines = await getHistoricalKlines(pair, timeframe, fetchStart, endTime);
  const resolutionKlines = timeframe === RESOLUTION_INTERVAL
    ? detectionKlines
    : await getHistoricalKlines(pair, RESOLUTION_INTERVAL, fetchStart, endTime);

  const trades: { status: 'WIN' | 'LOSS'; pnlPercent: number; entryTime: Date; closedAt: Date }[] = [];
  const dedupGap = dedupCandleGap(timeframe);
  let lastTradeIndex = -Infinity;
  let resPointer = 0;

  for (let i = required - 1; i < detectionKlines.length; i++) {
    if (i - lastTradeIndex < dedupGap) continue;
    const window = detectionKlines.slice(i - required + 1, i + 1);
    const signal = detectMeasuredMove(window, pair);
    if (!signal) continue;

    const entryTime = detectionKlines[i].closeTime;
    while (resPointer < resolutionKlines.length && resolutionKlines[resPointer].closeTime <= entryTime) resPointer++;

    const outcome = simulateOutcome(signal, resolutionKlines, resPointer, RESOLUTION_LOOKAHEAD_CANDLES);
    if (!outcome) continue;

    trades.push({ status: outcome.status, pnlPercent: outcome.pnlPercent, entryTime: new Date(entryTime), closedAt: outcome.closedAt });
    lastTradeIndex = i;
  }

  trades.sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime());
  const overall = computeMetrics(tradesToTradeLikes(pair, timeframe, trades));

  const half = Math.ceil(trades.length / 2);
  const firstHalf = trades.slice(0, half);
  const secondHalf = trades.slice(half);
  const m1 = computeMetrics(tradesToTradeLikes(pair, timeframe, firstHalf));
  const m2 = computeMetrics(tradesToTradeLikes(pair, timeframe, secondHalf));

  console.log(`${pair} × ${timeframe} (measured move): ${trades.length} trades | PF geral ${overall.profitFactor.toFixed(2)} | pedaços [${m1.profitFactor.toFixed(2)}, ${m2.profitFactor.toFixed(2)}]`);
}

const COMBOS = [
  { pair: 'ETHUSDT', timeframe: '1h' },
  { pair: 'XRPUSDT', timeframe: '1h' },
  { pair: 'WLDUSDT', timeframe: '15m' },
  { pair: 'LTCUSDT', timeframe: '1h' },
];

async function main() {
  console.log('Baseline (fórmula original, riskDistance × 1.5/3) pra comparação:');
  console.log('  ETHUSDT × 1h: PF 1.25, pedaços [2.22, 0.54]');
  console.log('  XRPUSDT × 1h: PF 1.27, pedaços [1.60, 0.92]');
  console.log('  WLDUSDT × 15m: PF 1.34, pedaços [1.67, 0.99]');
  console.log('  LTCUSDT × 1h: PF 1.68, pedaços [3.67, 0.63]');
  console.log('');
  console.log('Variante (measured move):');
  for (const c of COMBOS) {
    await runExperiment(c.pair, c.timeframe, 3);
  }
}

main().catch((e) => {
  console.error('[experiment] Falha:', e?.message ?? e);
  process.exit(1);
});
