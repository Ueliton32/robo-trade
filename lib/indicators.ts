import { Kline } from './binance';

// ─────────────────────────────────────────────────────────────────────────
// Movidos de lib/strategies.ts pra cá — mesma lógica exata, só compartilhada
// agora entre as 6 estratégias curadas e o motor do radar.
// ─────────────────────────────────────────────────────────────────────────

export function calcEMA(closes: number[], period: number): number[] {
  const ema: number[] = [];
  const k = 2 / (period + 1);
  ema[0] = closes?.[0] ?? 0;
  for (let i = 1; i < (closes?.length ?? 0); i++) {
    ema[i] = (closes?.[i] ?? 0) * k + (ema?.[i - 1] ?? 0) * (1 - k);
  }
  return ema;
}

export function calcATR(klines: Kline[], period = 14): number {
  if ((klines?.length ?? 0) < period + 1) return 0;
  let atr = 0;
  for (let i = (klines?.length ?? 0) - period; i < (klines?.length ?? 0); i++) {
    const k = klines?.[i];
    const prev = klines?.[i - 1];
    if (!k || !prev) continue;
    const tr = Math.max(k.high - k.low, Math.abs(k.high - prev.close), Math.abs(k.low - prev.close));
    atr += tr;
  }
  return atr / period;
}

// ─────────────────────────────────────────────────────────────────────────
// VWAP — ancorado por dia UTC (reinicia à meia-noite UTC), igual ao padrão
// que a maioria das plataformas de cripto usa (mercado 24/7 não tem
// "abertura de pregão" natural, então o dia UTC vira a âncora convencional).
// Retorna o VWAP do dia corrente (últimos candles desde a meia-noite UTC
// mais recente).
// ─────────────────────────────────────────────────────────────────────────
export function calcVWAP(klines: Kline[]): number | null {
  if (!klines?.length) return null;

  const last = klines[klines.length - 1];
  const lastDayStart = new Date(last.openTime);
  lastDayStart.setUTCHours(0, 0, 0, 0);
  const dayStartMs = lastDayStart.getTime();

  const todayKlines = klines.filter((k) => k.openTime >= dayStartMs);
  // Se o dia UTC começou há pouco e não há candles suficientes ainda,
  // usa os últimos candles disponíveis como aproximação (evita retornar
  // null logo na virada do dia).
  const source = todayKlines.length >= 3 ? todayKlines : klines.slice(-20);

  let cumPV = 0;
  let cumV = 0;
  for (const k of source) {
    const typicalPrice = (k.high + k.low + k.close) / 3;
    cumPV += typicalPrice * k.volume;
    cumV += k.volume;
  }

  return cumV > 0 ? cumPV / cumV : null;
}

// ─────────────────────────────────────────────────────────────────────────
// MACD — EMA12 - EMA26 = linha MACD; EMA9 da linha MACD = linha de sinal;
// MACD - sinal = histograma. Retorna só os valores mais recentes (é o que
// os filtros de confirmação de momentum precisam).
// ─────────────────────────────────────────────────────────────────────────
export interface MACDResult {
  macd: number;
  signal: number;
  histogram: number;
}

export function calcMACD(closes: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): MACDResult | null {
  if ((closes?.length ?? 0) < slowPeriod + signalPeriod) return null;

  const emaFast = calcEMA(closes, fastPeriod);
  const emaSlow = calcEMA(closes, slowPeriod);
  const macdLine = closes.map((_, i) => (emaFast[i] ?? 0) - (emaSlow[i] ?? 0));
  const signalLine = calcEMA(macdLine, signalPeriod);

  const lastIdx = closes.length - 1;
  const macd = macdLine[lastIdx] ?? 0;
  const signal = signalLine[lastIdx] ?? 0;

  return { macd, signal, histogram: macd - signal };
}

// ─────────────────────────────────────────────────────────────────────────
// ROC — Rate of Change: variação percentual do preço em relação a N
// candles atrás. Padrão de mercado costuma usar 12; deixamos configurável.
// ─────────────────────────────────────────────────────────────────────────
export function calcROC(closes: number[], period = 12): number | null {
  if ((closes?.length ?? 0) < period + 1) return null;
  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  if (!past) return null;
  return ((current - past) / past) * 100;
}
