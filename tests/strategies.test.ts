import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectRangeBreakout,
  detectPullbackEMA,
  detectLiquidityTrap,
  detectFundingExtreme,
  detectMassLiquidation,
  detectVolatilitySqueeze,
} from '../lib/strategies';
import type { Kline } from '../lib/binance';

// ───────────────────────────────────────────────────────────────────────
// Helpers — os 6 detectores são funções puras (klines in, sinal out),
// então os testes aqui constroem séries de candles sintéticas pra forçar
// cada caminho de decisão, sem precisar de rede nem banco.
// ───────────────────────────────────────────────────────────────────────

interface KlineSpec {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function buildKlines(specs: KlineSpec[]): Kline[] {
  return specs.map((s, i) => ({
    openTime: i * 60_000,
    closeTime: i * 60_000 + 59_999,
    ...s,
  }));
}

// N candles "quietos" (range e volume baixos e constantes) — usados como
// base de consolidação/histórico normal antes do candle de interesse.
function quietCandles(n: number, price = 100, volume = 100): KlineSpec[] {
  return Array.from({ length: n }, () => ({
    open: price, high: price + 0.2, low: price - 0.2, close: price, volume,
  }));
}

test('detectRangeBreakout — rompimento altista com expansão real de ATR gera sinal LONG', () => {
  const base = quietCandles(29, 100, 100);
  // Candle de rompimento: fecha bem acima do range (consolidação ~99.8-100.2),
  // volume bem acima da média, E com range amplo o suficiente pra passar no
  // gate de ATR (atrRecent/atrNormal > 1.3) — ver comentário em
  // lib/strategies.ts sobre o achado de rompimento falso de 23/10/2026.
  const breakout: KlineSpec = { open: 100, high: 105.5, low: 99.8, close: 105, volume: 500 };
  const klines = buildKlines([...base, breakout]);

  const signal = detectRangeBreakout(klines, 'BTCUSDT', '1h');
  assert.ok(signal, 'deveria detectar rompimento altista');
  assert.equal(signal!.direction, 'LONG');
  assert.equal(signal!.strategyId, 1);
  assert.equal(signal!.entryPrice, 105);
  assert.ok(signal!.stopLoss < signal!.entryPrice, 'stop de LONG deve ficar abaixo da entrada');
  assert.ok(signal!.target1 > signal!.entryPrice, 'alvo de LONG deve ficar acima da entrada');
  // Alvo sempre respeita pelo menos 1.5:1 de retorno/risco (comentário do código).
  const risk = signal!.entryPrice - signal!.stopLoss;
  assert.ok(Math.abs(signal!.target1 - signal!.entryPrice - risk * 1.5) < 1e-6);
});

test('detectRangeBreakout — rompimento baixista simétrico gera sinal SHORT', () => {
  const base = quietCandles(29, 100, 100);
  const breakout: KlineSpec = { open: 100, high: 100.2, low: 94.5, close: 95, volume: 500 };
  const klines = buildKlines([...base, breakout]);

  const signal = detectRangeBreakout(klines, 'BTCUSDT', '1h');
  assert.ok(signal, 'deveria detectar rompimento baixista');
  assert.equal(signal!.direction, 'SHORT');
  assert.ok(signal!.stopLoss > signal!.entryPrice, 'stop de SHORT deve ficar acima da entrada');
  assert.ok(signal!.target1 < signal!.entryPrice, 'alvo de SHORT deve ficar abaixo da entrada');
});

test('detectRangeBreakout — gate de ATR bloqueia rompimento sem expansão real de volatilidade (fakeout)', () => {
  const base = quietCandles(29, 100, 100);
  // Fecha acima do range e com volume alto o bastante pra passar nos dois
  // primeiros filtros, mas o candle em si é quase tão "quieto" quanto os
  // anteriores — atrRecent/atrNormal fica perto de 1.0, não passa de 1.3.
  const weakBreakout: KlineSpec = { open: 100, high: 100.35, low: 100.2, close: 100.3, volume: 500 };
  const klines = buildKlines([...base, weakBreakout]);

  const signal = detectRangeBreakout(klines, 'BTCUSDT', '1h');
  assert.equal(signal, null, 'rompimento sem expansão de ATR deve ser rejeitado (fakeout)');
});

test('detectRangeBreakout — sem rompimento de preço retorna null mesmo com volume alto', () => {
  const base = quietCandles(29, 100, 100);
  const noBreak: KlineSpec = { open: 100, high: 100.1, low: 99.9, close: 100, volume: 500 };
  const klines = buildKlines([...base, noBreak]);
  assert.equal(detectRangeBreakout(klines, 'BTCUSDT', '1h'), null);
});

test('detectRangeBreakout — rompimento sem volume acima de 1.5x a média retorna null', () => {
  const base = quietCandles(29, 100, 100);
  const lowVolBreakout: KlineSpec = { open: 100, high: 105.5, low: 99.8, close: 105, volume: 110 };
  const klines = buildKlines([...base, lowVolBreakout]);
  assert.equal(detectRangeBreakout(klines, 'BTCUSDT', '1h'), null);
});

test('detectRangeBreakout — range de consolidação acima de 4% não é considerado consolidação', () => {
  // 20 candles anteriores oscilando mais de 4% (99-104) — não é consolidação,
  // mesmo que o último candle feche acima de tudo com volume alto.
  const wideRange: KlineSpec[] = Array.from({ length: 29 }, (_, i) => ({
    open: 99 + (i % 2) * 5, high: 104.5, low: 99, close: 99 + (i % 2) * 5, volume: 100,
  }));
  const breakout: KlineSpec = { open: 100, high: 110, low: 99.8, close: 109, volume: 500 };
  const klines = buildKlines([...wideRange, breakout]);
  assert.equal(detectRangeBreakout(klines, 'BTCUSDT', '1h'), null);
});

test('detectRangeBreakout — menos de 30 candles retorna null', () => {
  const klines = buildKlines(quietCandles(20, 100, 100));
  assert.equal(detectRangeBreakout(klines, 'BTCUSDT', '1h'), null);
});

// ───────────────────────────────────────────────────────────────────────
// Strategy 2: Pullback na EMA20
// ───────────────────────────────────────────────────────────────────────

function uptrendWithPullback(): KlineSpec[] {
  // Série subindo de forma constante (closes crescentes) pra EMA20 seguir
  // de perto o preço, terminando num candle que toca a EMA por baixo com
  // pavio de rejeição maior que o corpo (sinal de LONG).
  const trend: KlineSpec[] = [];
  let price = 90;
  for (let i = 0; i < 24; i++) {
    price += 0.5;
    trend.push({ open: price - 0.3, high: price + 0.3, low: price - 0.4, close: price, volume: 100 });
  }
  // Último candle: a EMA20 fica bem atrás do preço numa série subindo de
  // forma constante (calculado à parte: fecha em 101.9 depois da subida,
  // EMA20 fica em ~98.12) — o pavio inferior precisa descer até perto da
  // EMA pra "tocar" ela, com corpo pequeno (quase doji) caracterizando
  // rejeição.
  const lastClose = price - 0.1; // 101.9
  trend.push({ open: lastClose, high: lastClose + 0.1, low: 98.1, close: lastClose, volume: 100 });
  return trend;
}

test('detectPullbackEMA — toque na EMA20 com rejeição em tendência de alta gera LONG', () => {
  const klines = buildKlines(uptrendWithPullback());
  const signal = detectPullbackEMA(klines, 'ETHUSDT', '1h');
  assert.ok(signal, 'deveria detectar pullback em tendência de alta');
  assert.equal(signal!.direction, 'LONG');
  assert.equal(signal!.strategyId, 2);
});

test('detectPullbackEMA — sem tendência clara (preço totalmente parado) retorna null', () => {
  const flat: KlineSpec[] = Array.from({ length: 26 }, () => ({
    open: 100, high: 100.1, low: 99.9, close: 100, volume: 100,
  }));
  const klines = buildKlines(flat);
  assert.equal(detectPullbackEMA(klines, 'ETHUSDT', '1h'), null);
});

test('detectPullbackEMA — menos de 25 candles retorna null', () => {
  const klines = buildKlines(quietCandles(20));
  assert.equal(detectPullbackEMA(klines, 'ETHUSDT', '1h'), null);
});

// ───────────────────────────────────────────────────────────────────────
// Strategy 3: Trap de Liquidez
// ───────────────────────────────────────────────────────────────────────

test('detectLiquidityTrap — fakeout acima de nível chave com volume spike gera SHORT', () => {
  // keyHigh/keyLow vêm de klines[-30:-3] — mantém essa janela quieta num
  // nível conhecido (high até 101), depois os últimos 3 candles fazem um
  // pavio acima de 101 mas fecham de volta abaixo, com volume de spike.
  const base = quietCandles(27, 100, 100).map((k) => ({ ...k, high: 101, low: 99 }));
  const recent3: KlineSpec[] = [
    { open: 100, high: 102.5, low: 99.8, close: 100.5, volume: 90 },
    { open: 100.5, high: 102.8, low: 100, close: 100.3, volume: 90 },
    { open: 100.3, high: 103, low: 100, close: 100.2, volume: 400 }, // fakeoutHigh + spike
  ];
  const klines = buildKlines([...base, ...recent3]);

  const signal = detectLiquidityTrap(klines, 'XRPUSDT', '1h');
  assert.ok(signal, 'deveria detectar trap de liquidez acima do nível chave');
  assert.equal(signal!.direction, 'SHORT');
  assert.equal(signal!.strategyId, 3);
});

test('detectLiquidityTrap — pavio além do nível sem volume de spike retorna null', () => {
  const base = quietCandles(27, 100, 100).map((k) => ({ ...k, high: 101, low: 99 }));
  const recent3: KlineSpec[] = [
    { open: 100, high: 102.5, low: 99.8, close: 100.5, volume: 90 },
    { open: 100.5, high: 102.8, low: 100, close: 100.3, volume: 90 },
    { open: 100.3, high: 103, low: 100, close: 100.2, volume: 95 }, // sem spike
  ];
  const klines = buildKlines([...base, ...recent3]);
  assert.equal(detectLiquidityTrap(klines, 'XRPUSDT', '1h'), null);
});

test('detectLiquidityTrap — menos de 30 candles retorna null', () => {
  const klines = buildKlines(quietCandles(25));
  assert.equal(detectLiquidityTrap(klines, 'XRPUSDT', '1h'), null);
});

// ───────────────────────────────────────────────────────────────────────
// Strategy 4: Funding Extremo
// ───────────────────────────────────────────────────────────────────────

test('detectFundingExtreme — funding muito positivo gera SHORT (exaustão de longs)', () => {
  const klines = buildKlines(quietCandles(15, 100, 100));
  const signal = detectFundingExtreme(klines, 'BTCUSDT', 0.002);
  assert.ok(signal, 'funding > 0.001 deveria disparar sinal');
  assert.equal(signal!.direction, 'SHORT');
  assert.equal(signal!.strategyId, 4);
});

test('detectFundingExtreme — funding muito negativo gera LONG (exaustão de shorts)', () => {
  const klines = buildKlines(quietCandles(15, 100, 100));
  const signal = detectFundingExtreme(klines, 'BTCUSDT', -0.001);
  assert.ok(signal, 'funding < -0.0005 deveria disparar sinal');
  assert.equal(signal!.direction, 'LONG');
});

test('detectFundingExtreme — funding dentro da faixa normal retorna null', () => {
  const klines = buildKlines(quietCandles(15, 100, 100));
  assert.equal(detectFundingExtreme(klines, 'BTCUSDT', 0.0002), null);
  assert.equal(detectFundingExtreme(klines, 'BTCUSDT', -0.0001), null);
});

test('detectFundingExtreme — menos de 10 candles retorna null mesmo com funding extremo', () => {
  const klines = buildKlines(quietCandles(5, 100, 100));
  assert.equal(detectFundingExtreme(klines, 'BTCUSDT', 0.005), null);
});

// ───────────────────────────────────────────────────────────────────────
// Strategy 5: Reversão após Liquidação em Massa
// ───────────────────────────────────────────────────────────────────────

test('detectMassLiquidation — cascata de queda excessiva gera LONG (reversão esperada)', () => {
  const prev10 = quietCandles(10, 100, 100); // movimento médio pequeno (~0.2)
  // Últimos 5 candles todos de queda, com corpo bem maior que a média anterior.
  const last5: KlineSpec[] = [
    { open: 100, high: 100.1, low: 97, close: 97, volume: 200 },
    { open: 97, high: 97.1, low: 94, close: 94, volume: 200 },
    { open: 94, high: 94.1, low: 91, close: 91, volume: 200 },
    { open: 91, high: 91.1, low: 88, close: 88, volume: 200 },
    { open: 88, high: 88.1, low: 85, close: 85, volume: 200 },
  ];
  const klines = buildKlines([...prev10, ...last5]);
  const signal = detectMassLiquidation(klines, 'SOLUSDT', '5m');
  assert.ok(signal, 'cascata de queda deveria disparar reversão LONG');
  assert.equal(signal!.direction, 'LONG');
  assert.equal(signal!.strategyId, 5);
});

test('detectMassLiquidation — movimento não excede 3x a média anterior retorna null', () => {
  // prev10 com movimento real (não zero) pra "3x a média" ser uma checagem
  // de verdade — candles alternando corpo de 0.3 (avgMove = 0.3).
  const prev10: KlineSpec[] = Array.from({ length: 10 }, (_, i) => (
    i % 2 === 0
      ? { open: 100, high: 100.4, low: 99.9, close: 100.3, volume: 100 }
      : { open: 100.3, high: 100.4, low: 99.9, close: 100, volume: 100 }
  ));
  // last5 com corpo médio bem menor que 3x0.3=0.9 — não deveria disparar.
  const last5: KlineSpec[] = Array.from({ length: 5 }, () => ({
    open: 100, high: 100.3, low: 99.7, close: 99.9, volume: 100,
  }));
  const klines = buildKlines([...prev10, ...last5]);
  assert.equal(detectMassLiquidation(klines, 'SOLUSDT', '5m'), null);
});

test('detectMassLiquidation — movimento grande mas misto (sem cascata na mesma direção) retorna null', () => {
  const prev10 = quietCandles(10, 100, 100);
  const last5: KlineSpec[] = [
    { open: 100, high: 100.1, low: 97, close: 97, volume: 200 },
    { open: 97, high: 100, low: 96.9, close: 99.9, volume: 200 }, // candle de alta no meio
    { open: 99.9, high: 100, low: 97, close: 97, volume: 200 },
    { open: 97, high: 100, low: 96.9, close: 99.9, volume: 200 },
    { open: 99.9, high: 100, low: 97, close: 97, volume: 200 },
  ];
  const klines = buildKlines([...prev10, ...last5]);
  assert.equal(detectMassLiquidation(klines, 'SOLUSDT', '5m'), null);
});

// ───────────────────────────────────────────────────────────────────────
// Strategy 6: Compressão de Volatilidade
// ───────────────────────────────────────────────────────────────────────

test('detectVolatilitySqueeze — squeeze seguido de breakout altista gera LONG', () => {
  // 25 candles com ATR "normal" moderado (range ~2), depois 9 candles bem
  // mais quietos (squeeze, range ~0.3) pra atrRecent cair abaixo de 65% do
  // atrFull, e o último candle rompe com corpo > 50% do atrFull.
  const normal: KlineSpec[] = Array.from({ length: 20 }, (_, i) => ({
    open: 100, high: 102, low: 98, close: 100 + (i % 2 === 0 ? 1 : -1), volume: 100,
  }));
  const squeeze: KlineSpec[] = Array.from({ length: 9 }, () => ({
    open: 100, high: 100.15, low: 99.85, close: 100, volume: 100,
  }));
  const breakoutCandle: KlineSpec = { open: 100, high: 102.5, low: 99.9, close: 102.2, volume: 300 };
  const klines = buildKlines([...normal, ...squeeze, breakoutCandle]);

  const signal = detectVolatilitySqueeze(klines, 'BNBUSDT', '1h');
  assert.ok(signal, 'squeeze seguido de expansão deveria disparar sinal');
  assert.equal(signal!.direction, 'LONG');
  assert.equal(signal!.strategyId, 6);
});

test('detectVolatilitySqueeze — sem squeeze prévio (volatilidade já normal) retorna null', () => {
  const normal: KlineSpec[] = Array.from({ length: 29 }, (_, i) => ({
    open: 100, high: 102, low: 98, close: 100 + (i % 2 === 0 ? 1 : -1), volume: 100,
  }));
  const breakoutCandle: KlineSpec = { open: 100, high: 102.5, low: 99.9, close: 102.2, volume: 300 };
  const klines = buildKlines([...normal, breakoutCandle]);
  assert.equal(detectVolatilitySqueeze(klines, 'BNBUSDT', '1h'), null);
});

test('detectVolatilitySqueeze — squeeze sem breakout no candle final retorna null', () => {
  const normal: KlineSpec[] = Array.from({ length: 20 }, (_, i) => ({
    open: 100, high: 102, low: 98, close: 100 + (i % 2 === 0 ? 1 : -1), volume: 100,
  }));
  const squeeze: KlineSpec[] = Array.from({ length: 10 }, () => ({
    open: 100, high: 100.15, low: 99.85, close: 100, volume: 100,
  }));
  const klines = buildKlines([...normal, ...squeeze]);
  assert.equal(detectVolatilitySqueeze(klines, 'BNBUSDT', '1h'), null);
});
