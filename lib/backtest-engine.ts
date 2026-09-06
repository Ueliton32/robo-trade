import { getHistoricalKlines, getHistoricalFundingRates, Kline } from '@/lib/binance';
import {
  detectRangeBreakout,
  detectPullbackEMA,
  detectLiquidityTrap,
  detectFundingExtreme,
  detectMassLiquidation,
  detectVolatilitySqueeze,
  REQUIRED_KLINES,
  DetectedSignal,
} from '@/lib/strategies';
import { computeMetrics, TradeLike, ComputedMetrics } from '@/lib/metrics';
// Mesma constante usada pra descontar custo dos sinais reais fechados
// (lib/stats-engine.ts), pra manter backtest e resultado ao vivo
// comparáveis (lib/divergence-check.ts depende disso). Aplicado em TODO
// trade simulado, ganho ou perda, pra não mostrar um resultado "de
// laboratório" bom demais pra ser real.
import { ROUNDTRIP_FEES_PERCENT as ASSUMED_ROUNDTRIP_FEES_PERCENT } from '@/lib/trading-costs';

// Mesmo critério de expiração usado ao vivo (lib/stats-engine.ts): se o
// preço não bateu em alvo nem stop depois desse tempo, descarta o trade
// simulado (não conta nem como WIN nem como LOSS).
const MAX_TRADE_AGE_DAYS = 10;

export interface BacktestTrade {
  pair: string;
  timeframe: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  target1: number;
  stopLoss: number;
  entryTime: Date;
  closedAt: Date;
  status: 'WIN' | 'LOSS';
  pnlPercent: number;
  reason: string;
}

export interface BacktestResult {
  metrics: ComputedMetrics;
  trades: BacktestTrade[];
  candlesAnalyzed: number;
  periodStart: Date;
  periodEnd: Date;
  feesApplied: number;
}

// A resolução de "quem bateu primeiro, alvo ou stop" é SEMPRE em candles de
// 15m — igual ao robô ao vivo (lib/stats-engine.ts) — não no timeframe da
// estratégia. Se usássemos candles de 1h/4h/1d pra resolver, alvo e stop
// caberiam com frequência dentro do MESMO candle grosso, e o desempate
// conservador ("assume que o stop bateu primeiro") junto de tanto "empate"
// gera LOSS artificial em excesso. Com granularidade fina, isso quase não
// acontece — fica muito mais fiel ao que aconteceria de verdade.
export const RESOLUTION_INTERVAL = '15m';
export const RESOLUTION_LOOKAHEAD_CANDLES = Math.ceil((MAX_TRADE_AGE_DAYS * 24 * 60) / 15);

export function minutesForTimeframe(tf: string): number {
  const map: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440 };
  return map[tf] ?? 60;
}

// Janela mínima entre dois trades simulados da mesma estratégia/par, pra
// aproximar a regra de "não duplicar sinal em 4h" que existe ao vivo.
export function dedupCandleGap(tf: string): number {
  return Math.max(1, Math.round(240 / minutesForTimeframe(tf)));
}

export function detectForStrategy(
  strategyId: number,
  window: Kline[],
  pair: string,
  timeframe: string,
  fundingRate: number
): DetectedSignal | null {
  switch (strategyId) {
    case 1: return detectRangeBreakout(window, pair, timeframe);
    case 2: return detectPullbackEMA(window, pair, timeframe);
    case 3: return detectLiquidityTrap(window, pair, timeframe);
    case 4: return detectFundingExtreme(window, pair, fundingRate);
    case 5: return detectMassLiquidation(window, pair, timeframe);
    case 6: return detectVolatilitySqueeze(window, pair, timeframe);
    default: return null;
  }
}

export function simulateOutcome(
  signal: { direction: 'LONG' | 'SHORT'; entryPrice: number; target1: number; stopLoss: number },
  klines: Kline[],
  startIdx: number,
  maxCandles: number
): { status: 'WIN' | 'LOSS'; pnlPercent: number; closedAt: Date } | null {
  const isLong = signal.direction === 'LONG';
  const endIdx = Math.min(klines.length, startIdx + maxCandles);

  for (let j = startIdx; j < endIdx; j++) {
    const k = klines[j];
    const hitStop = isLong ? k.low <= signal.stopLoss : k.high >= signal.stopLoss;
    const hitTarget = isLong ? k.high >= signal.target1 : k.low <= signal.target1;

    if (hitStop) {
      const raw = isLong
        ? ((signal.stopLoss - signal.entryPrice) / signal.entryPrice) * 100
        : ((signal.entryPrice - signal.stopLoss) / signal.entryPrice) * 100;
      return { status: 'LOSS', pnlPercent: raw - ASSUMED_ROUNDTRIP_FEES_PERCENT, closedAt: new Date(k.closeTime) };
    }
    if (hitTarget) {
      const raw = isLong
        ? ((signal.target1 - signal.entryPrice) / signal.entryPrice) * 100
        : ((signal.entryPrice - signal.target1) / signal.entryPrice) * 100;
      return { status: 'WIN', pnlPercent: raw - ASSUMED_ROUNDTRIP_FEES_PERCENT, closedAt: new Date(k.closeTime) };
    }
  }
  return null;
}

/**
 * Roda uma estratégia contra o histórico real de candles da Binance,
 * simulando "se o robô estivesse rodando ao vivo desde essa data, o que
 * teria acontecido". Usa exatamente a mesma lógica de decisão (os
 * detectXxx de lib/strategies.ts) que o robô usa de verdade — não é uma
 * versão simplificada, é o mesmo código.
 */
export async function runBacktest(params: {
  strategyId: number;
  pair: string;
  timeframe: string;
  months: number;
}): Promise<BacktestResult> {
  const { strategyId, pair } = params;
  const timeframe = strategyId === 4 ? '1h' : params.timeframe;
  const months = Math.min(Math.max(params.months, 1), 24);

  const endTime = Date.now();
  const periodStart = endTime - months * 30 * 24 * 60 * 60 * 1000;

  const required = REQUIRED_KLINES[strategyId] ?? 60;
  const lookbackMs = required * minutesForTimeframe(timeframe) * 60 * 1000;
  const fetchStart = periodStart - lookbackMs;

  const detectionKlines = await getHistoricalKlines(pair, timeframe, fetchStart, endTime);

  // Reaproveita a mesma busca se o timeframe da estratégia já é 15m —
  // evita buscar o histórico duas vezes à toa.
  const resolutionKlines = timeframe === RESOLUTION_INTERVAL
    ? detectionKlines
    : await getHistoricalKlines(pair, RESOLUTION_INTERVAL, fetchStart, endTime);

  let fundingSeries: Array<{ time: number; rate: number }> = [];
  if (strategyId === 4) {
    const fr = await getHistoricalFundingRates(pair, fetchStart, endTime);
    fundingSeries = fr
      .map((f) => ({ time: f.fundingTime, rate: parseFloat(f.fundingRate ?? '0') }))
      .sort((a, b) => a.time - b.time);
  }

  const trades: BacktestTrade[] = [];
  const dedupGap = dedupCandleGap(timeframe);
  let lastTradeIndex = -Infinity;
  let fundingIdx = 0;
  let resPointer = 0; // avança só pra frente — os sinais são processados em ordem cronológica

  for (let i = required - 1; i < detectionKlines.length; i++) {
    if (i - lastTradeIndex < dedupGap) continue;

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

    const entryTime = detectionKlines[i].closeTime;

    // acha o primeiro candle de 15m estritamente depois da entrada, pra
    // começar a resolução dali — nunca antes (evitaria olhar dado que "já
    // aconteceu" antes do sinal existir).
    while (resPointer < resolutionKlines.length && resolutionKlines[resPointer].closeTime <= entryTime) {
      resPointer++;
    }

    const outcome = simulateOutcome(signal, resolutionKlines, resPointer, RESOLUTION_LOOKAHEAD_CANDLES);
    if (!outcome) continue; // não resolveu dentro da janela — descarta, não conta

    trades.push({
      pair,
      timeframe,
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      target1: signal.target1,
      stopLoss: signal.stopLoss,
      entryTime: new Date(entryTime),
      closedAt: outcome.closedAt,
      status: outcome.status,
      pnlPercent: outcome.pnlPercent,
      reason: signal.reason,
    });
    lastTradeIndex = i;
  }

  const tradeLikes: TradeLike[] = trades.map((t) => ({
    pair: t.pair,
    timeframe: t.timeframe,
    status: t.status,
    pnlPercent: t.pnlPercent,
    createdAt: t.entryTime,
    closedAt: t.closedAt,
  }));

  const metrics = computeMetrics(tradeLikes);

  return {
    metrics,
    trades,
    candlesAnalyzed: detectionKlines.length,
    periodStart: new Date(periodStart),
    periodEnd: new Date(endTime),
    feesApplied: ASSUMED_ROUNDTRIP_FEES_PERCENT,
  };
}
