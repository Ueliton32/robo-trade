import { getKlines, getFundingRate, getOpenInterest, Kline } from './binance';
import { calcEMA, calcATR } from './indicators';
import { VOLATILITY_EXPANSION_RATIO } from './regime';

export interface SignalData {
  strategyId: number;
  strategyName: string;
  pair: string;
  direction: 'LONG' | 'SHORT';
  timeframe: string;
  mode: string;
  entryPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  leverage: string;
  confidence: number;
  reason: string;
}

// Sinal "puro", sem pair/timeframe (quem chama o detector já sabe esses dois).
export type DetectedSignal = Omit<SignalData, 'pair' | 'timeframe'>;

// Quantos candles cada estratégia precisa no mínimo pra decidir (usado tanto
// pela busca ao vivo quanto pelo backtest, pra saber o tamanho da janela).
export const REQUIRED_KLINES: Record<number, number> = {
  1: 50,
  2: 50,
  3: 60,
  4: 20,
  5: 30,
  6: 50,
};

// ─────────────────────────────────────────────────────────────────────────
// Moedas disponíveis, tiers de volatilidade e sugestão de estratégia por
// moeda — baseado em pesquisa de mercado trazida pelo usuário (Kraken,
// Phemex, ASCN, KuCoin), NÃO em backtest validado nesta conta. Trate como
// ponto de partida editável, não como verdade — o objetivo é poder
// comparar "com tier" vs "sem tier" no backtest antes de confiar.
// ─────────────────────────────────────────────────────────────────────────

// PEPE é listado na Binance Futures como 1000PEPEUSDT (contrato representa
// 1000 unidades, por causa do preço unitário muito baixo do token).
export const ALL_AVAILABLE_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'ADAUSDT', 'SUIUSDT', 'AVAXUSDT', 'LINKUSDT', 'LTCUSDT', 'TRXUSDT', 'XLMUSDT', 'UNIUSDT', 'DOTUSDT', 'BCHUSDT',
  'DOGEUSDT', '1000PEPEUSDT', 'ZECUSDT', 'HYPEUSDT', 'WLDUSDT', 'TAOUSDT',
];

export type VolatilityTier = 'alta_liquidez' | 'intermediaria' | 'alta_volatilidade';

export const PAIR_VOLATILITY_TIER: Record<string, VolatilityTier> = {
  BTCUSDT: 'alta_liquidez', ETHUSDT: 'alta_liquidez', SOLUSDT: 'alta_liquidez', BNBUSDT: 'alta_liquidez', XRPUSDT: 'alta_liquidez',
  ADAUSDT: 'intermediaria', SUIUSDT: 'intermediaria', AVAXUSDT: 'intermediaria', LINKUSDT: 'intermediaria',
  LTCUSDT: 'intermediaria', TRXUSDT: 'intermediaria', XLMUSDT: 'intermediaria', UNIUSDT: 'intermediaria',
  DOTUSDT: 'intermediaria', BCHUSDT: 'intermediaria',
  DOGEUSDT: 'alta_volatilidade', '1000PEPEUSDT': 'alta_volatilidade', ZECUSDT: 'alta_volatilidade',
  HYPEUSDT: 'alta_volatilidade', WLDUSDT: 'alta_volatilidade', TAOUSDT: 'alta_volatilidade',
};

// Multiplicador aplicado só na MARGEM de segurança do stop (a parte baseada
// em ATR), nunca no ponto estrutural de invalidação (fundo/topo/nível-chave)
// nem no alvo. O ATR já é calculado em cima do histórico de cada moeda, mas
// moedas de menor liquidez tendem a ter caudas mais gordas do que o ATR
// recente capta — esse multiplicador é uma margem extra de segurança pra
// isso, não uma correção matemática exata.
const STOP_TIER_MULTIPLIER: Record<VolatilityTier, number> = {
  alta_liquidez: 1.0,
  intermediaria: 1.3,
  alta_volatilidade: 1.6,
};

export function stopTierMultiplier(pair: string): number {
  const tier = PAIR_VOLATILITY_TIER[pair] ?? 'intermediaria';
  return STOP_TIER_MULTIPLIER[tier];
}

// Mesmo raciocínio do stop, aplicado à alavancagem sugerida: a margem de
// stop já é proporcionalmente maior em moeda de tier mais arriscado
// (STOP_TIER_MULTIPLIER acima), então a MESMA alavancagem nominal (ex:
// "5x-10x") representa um % de capital em risco até a liquidação bem maior
// numa moeda alta_volatilidade do que em BTC — antes disso, a faixa de
// leverage sugerida era idêntica pra todo par, independente do tier.
// Reduz a faixa inteira (não só o teto), mantendo a proporção min/max
// original de cada estratégia, e nunca sugere menos de 2x.
const LEVERAGE_TIER_SCALE: Record<VolatilityTier, number> = {
  alta_liquidez: 1,
  intermediaria: 0.7,
  alta_volatilidade: 0.5,
};

export function tieredLeverage(baseMin: number, baseMax: number, pair: string): string {
  const tier = PAIR_VOLATILITY_TIER[pair] ?? 'intermediaria';
  const scale = LEVERAGE_TIER_SCALE[tier];
  const min = Math.max(2, Math.round(baseMin * scale));
  const max = Math.max(min, Math.round(baseMax * scale));
  return `${min}x-${max}x`;
}

// Tradução livre (feita por nós, não uma citação literal da pesquisa) das
// categorias soltas do documento ("momentum", "trend following" etc.) para
// os IDs das nossas 6 estratégias. Serve de sugestão inicial editável na
// tela de Configurações — não é aplicada automaticamente sem o usuário
// confirmar.
export const RECOMMENDED_STRATEGIES_BY_PAIR: Record<string, number[]> = {
  BTCUSDT: [1, 2, 4],
  ETHUSDT: [1, 2, 4],
  SOLUSDT: [1, 2, 6],
  XRPUSDT: [1, 3, 6],
  BNBUSDT: [1, 3, 6],
  ADAUSDT: [1, 2],
  SUIUSDT: [1, 2],
  AVAXUSDT: [1, 2],
  LINKUSDT: [1, 2],
  LTCUSDT: [3],
  TRXUSDT: [3],
  XLMUSDT: [3, 6],
  UNIUSDT: [1, 6],
  DOTUSDT: [1, 2],
  BCHUSDT: [2],
  DOGEUSDT: [1, 6],
  '1000PEPEUSDT': [1],
  ZECUSDT: [1, 6],
  HYPEUSDT: [1, 2, 6],
  WLDUSDT: [1, 4],
  TAOUSDT: [1, 6],
};

// ─────────────────────────────────────────────────────────────────────────
// Strategy 1: Rompimento de Range
// ─────────────────────────────────────────────────────────────────────────
export function detectRangeBreakout(klines: Kline[], pair: string, timeframe: string, oiText: string = 'N/A'): DetectedSignal | null {
  if ((klines?.length ?? 0) < 30) return null;

  // Os 20 candles ANTERIORES ao atual — sem incluir o candle que estamos
  // checando, senão a máxima/mínima do range sempre inclui o próprio
  // candle e ele nunca consegue "romper" o próprio nível (bug corrigido).
  const recent = klines.slice(-21, -1);
  const highs = recent.map((k: Kline) => k?.high ?? 0);
  const lows = recent.map((k: Kline) => k?.low ?? 0);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangeSize = rangeHigh - rangeLow;
  const avgRange = rangeSize / rangeHigh;

  if (avgRange > 0.04) return null; // not consolidating

  const last = klines[klines.length - 1];
  const prevVols = klines.slice(-10, -1).map((k: Kline) => k?.volume ?? 0);
  const avgVol = prevVols.reduce((a: number, b: number) => a + b, 0) / (prevVols?.length ?? 1);

  if (!last) return null;

  const breakUp = last.close > rangeHigh && last.volume > avgVol * 1.5;
  const breakDown = last.close < rangeLow && last.volume > avgVol * 1.5;

  if (!breakUp && !breakDown) return null;

  // Gate de rompimento falso (23/10/2026) — achado na auditoria: nos 10
  // sinais LONG mais recentes em regime LATERALIZACAO (exatamente o que o
  // filtro de regime já libera), 0% WR, atrRatio sempre perto de 1.0
  // (0.78-1.22) — o preço rompia o range sem volatilidade de verdade
  // sustentando o movimento (fakeout). Exige expansão real de ATR (mesmo
  // limiar de lib/regime.ts, VOLATILITY_EXPANSION_RATIO) antes de aceitar
  // o rompimento. Backtest de 6 meses, combinado com o filtro de regime
  // (scripts/experiment-range-breakout-regime-atr.ts e
  // scripts/experiment-range-breakout-regime-atr-15m-sweep.ts): validado
  // em 15m pra BTC/ETH/BNB/TRX/LINK (PF 1.22-1.62); outros pares ficaram
  // neutros ou negativos mesmo com o gate — não é uma correção universal,
  // é condicionada ao par (ver lib/pair-strategy-plan.ts pra quais pares
  // rodam a #1 hoje). Em 1h, o gate some com o sinal quase inteiro (n=0
  // em todos os 6 pares testados) — sem evidência de que funcione lá.
  const atrNormal = calcATR(klines.slice(0, -5), 14);
  const atrRecent = calcATR(klines.slice(-10), 5);
  const atrRatio = atrNormal > 0 ? atrRecent / atrNormal : 1;
  if (atrRatio <= VOLATILITY_EXPANSION_RATIO) return null;

  const dir = breakUp ? 'LONG' : 'SHORT';
  const entry = last.close;
  const atr = calcATR(klines);
  const mult = stopTierMultiplier(pair);
  const mode = timeframe === '15m' || timeframe === '5m' ? 'Day Trade' : 'Swing Trade';

  // Stop primeiro (estrutural: fora do range, com margem de ATR).
  const stopLoss = dir === 'LONG' ? rangeLow - atr * 0.5 * mult : rangeHigh + atr * 0.5 * mult;

  // Alvo proporcional à distância REAL até o stop — antes era fixo em ATR,
  // o que criava payoff de 0,1-0,3x quando o range era mais largo que o
  // ATR (quase sempre). Agora o alvo sempre respeita pelo menos 1,5:1 de
  // retorno/risco em cima do risco de verdade que está sendo assumido.
  const riskDistance = Math.abs(entry - stopLoss);

  return {
    strategyId: 1,
    strategyName: 'Rompimento de Range',
    direction: dir as 'LONG' | 'SHORT',
    mode,
    entryPrice: entry,
    target1: dir === 'LONG' ? entry + riskDistance * 1.5 : entry - riskDistance * 1.5,
    target2: dir === 'LONG' ? entry + riskDistance * 3 : entry - riskDistance * 3,
    stopLoss,
    leverage: mode === 'Day Trade' ? tieredLeverage(5, 10, pair) : tieredLeverage(3, 5, pair),
    confidence: 72,
    reason: `Rompimento ${dir === 'LONG' ? 'altista' : 'baixista'} do range de consol. em ${timeframe}. Volume ${((last.volume / avgVol) * 100 - 100).toFixed(0)}% acima da m\u00e9dia. OI: ${oiText}.`,
  };
}

export async function analyzeRangeBreakout(pair: string, timeframe: string): Promise<SignalData | null> {
  const klines = await getKlines(pair, timeframe, 50);
  const oi = await getOpenInterest(pair);
  const detected = detectRangeBreakout(klines, pair, timeframe, oi?.openInterest ?? 'N/A');
  return detected ? { ...detected, pair, timeframe } : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Strategy 2: Pullback na EMA20
// ─────────────────────────────────────────────────────────────────────────
export function detectPullbackEMA(klines: Kline[], pair: string, timeframe: string): DetectedSignal | null {
  if ((klines?.length ?? 0) < 25) return null;

  const closes = klines.map((k: Kline) => k?.close ?? 0);
  const ema20 = calcEMA(closes, 20);
  const last = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  const lastEma = ema20[ema20.length - 1] ?? 0;

  if (!last || !prev) return null;

  const trend = closes.slice(-5).filter((c: number, i: number) => c > (ema20[ema20.length - 5 + i] ?? 0));
  const isUptrend = (trend?.length ?? 0) >= 3;
  const isDowntrend = (closes.slice(-5).filter((c: number, i: number) => c < (ema20[ema20.length - 5 + i] ?? 0))?.length ?? 0) >= 3;

  if (!isUptrend && !isDowntrend) return null;

  const touchEma = Math.abs(last.low - lastEma) / lastEma < 0.003 || Math.abs(last.high - lastEma) / lastEma < 0.003;
  if (!touchEma) return null;

  const bodySize = Math.abs(last.close - last.open);
  const wickLow = Math.min(last.open, last.close) - last.low;
  const wickHigh = last.high - Math.max(last.open, last.close);

  const dir = isUptrend && wickLow > bodySize ? 'LONG' : isDowntrend && wickHigh > bodySize ? 'SHORT' : null;
  if (!dir) return null;

  const atr = calcATR(klines);
  const mult = stopTierMultiplier(pair);
  const mode = timeframe === '1h' ? 'Day Trade' : 'Swing Trade';

  return {
    strategyId: 2,
    strategyName: 'Pullback na EMA20',
    direction: dir as 'LONG' | 'SHORT',
    mode,
    entryPrice: last.close,
    target1: dir === 'LONG' ? last.close + atr * 2 : last.close - atr * 2,
    target2: dir === 'LONG' ? last.close + atr * 4 : last.close - atr * 4,
    stopLoss: dir === 'LONG' ? last.low - atr * 0.5 * mult : last.high + atr * 0.5 * mult,
    leverage: mode === 'Day Trade' ? tieredLeverage(5, 10, pair) : tieredLeverage(3, 5, pair),
    confidence: 68,
    reason: `Pullback na EMA20 em ${timeframe} com rejei\u00e7\u00e3o. Tend\u00eancia ${isUptrend ? 'de alta' : 'de baixa'} confirmada.`,
  };
}

export async function analyzePullbackEMA(pair: string, timeframe: string): Promise<SignalData | null> {
  const klines = await getKlines(pair, timeframe, 50);
  const detected = detectPullbackEMA(klines, pair, timeframe);
  return detected ? { ...detected, pair, timeframe } : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Strategy 3: Trap de Liquidez
// ─────────────────────────────────────────────────────────────────────────
export function detectLiquidityTrap(klines: Kline[], pair: string, timeframe: string): DetectedSignal | null {
  if ((klines?.length ?? 0) < 30) return null;

  const highs = klines.slice(-30, -3).map((k: Kline) => k?.high ?? 0);
  const lows = klines.slice(-30, -3).map((k: Kline) => k?.low ?? 0);
  const keyHigh = Math.max(...highs);
  const keyLow = Math.min(...lows);

  const recent3 = klines.slice(-3);
  const last = klines[klines.length - 1];
  if (!last) return null;

  const fakeoutHigh = recent3.some((k: Kline) => (k?.high ?? 0) > keyHigh) && last.close < keyHigh;
  const fakeoutLow = recent3.some((k: Kline) => (k?.low ?? 0) < keyLow) && last.close > keyLow;

  if (!fakeoutHigh && !fakeoutLow) return null;

  const prevVols = klines.slice(-10, -3).map((k: Kline) => k?.volume ?? 0);
  const avgVol = prevVols.reduce((a: number, b: number) => a + b, 0) / (prevVols?.length ?? 1);
  const spikeVol = recent3.some((k: Kline) => (k?.volume ?? 0) > avgVol * 1.8);
  if (!spikeVol) return null;

  const dir = fakeoutHigh ? 'SHORT' : 'LONG';
  const atr = calcATR(klines);
  const mult = stopTierMultiplier(pair);
  const mode = timeframe === '5m' || timeframe === '15m' ? 'Day Trade' : 'Swing Trade';

  return {
    strategyId: 3,
    strategyName: 'Trap de Liquidez',
    direction: dir as 'LONG' | 'SHORT',
    mode,
    entryPrice: last.close,
    target1: dir === 'LONG' ? last.close + atr * 2 : last.close - atr * 2,
    target2: dir === 'LONG' ? last.close + atr * 4 : last.close - atr * 4,
    stopLoss: dir === 'LONG' ? keyLow - atr * mult : keyHigh + atr * mult,
    leverage: tieredLeverage(5, 10, pair),
    confidence: 75,
    reason: `Trap de liquidez ${dir === 'SHORT' ? 'acima' : 'abaixo'} de n\u00edvel chave. Fakeout com volume spike e revers\u00e3o r\u00e1pida em ${timeframe}.`,
  };
}

export async function analyzeLiquidityTrap(pair: string, timeframe: string): Promise<SignalData | null> {
  const klines = await getKlines(pair, timeframe, 60);
  const detected = detectLiquidityTrap(klines, pair, timeframe);
  return detected ? { ...detected, pair, timeframe } : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Strategy 4: Funding Extremo
// ─────────────────────────────────────────────────────────────────────────
export function detectFundingExtreme(klines: Kline[], pair: string, fundingRate: number, oiText: string = 'N/A'): DetectedSignal | null {
  if ((klines?.length ?? 0) < 10) return null;

  const isExtremePos = fundingRate > 0.001;
  const isExtremeNeg = fundingRate < -0.0005;
  if (!isExtremePos && !isExtremeNeg) return null;

  const last = klines[klines.length - 1];
  if (!last) return null;
  const atr = calcATR(klines);
  const mult = stopTierMultiplier(pair);
  const dir = isExtremePos ? 'SHORT' : 'LONG';

  return {
    strategyId: 4,
    strategyName: 'Funding Extremo',
    direction: dir as 'LONG' | 'SHORT',
    mode: 'Day Trade',
    entryPrice: last.close,
    target1: dir === 'LONG' ? last.close + atr * 2 : last.close - atr * 2,
    target2: dir === 'LONG' ? last.close + atr * 4 : last.close - atr * 4,
    stopLoss: dir === 'LONG' ? last.close - atr * 1.5 * mult : last.close + atr * 1.5 * mult,
    leverage: tieredLeverage(3, 5, pair),
    confidence: 70,
    reason: `Funding rate extremo: ${(fundingRate * 100).toFixed(4)}%. Poss\u00edvel exaust\u00e3o de ${isExtremePos ? 'longs' : 'shorts'}. OI: ${oiText}.`,
  };
}

export async function analyzeFundingExtreme(pair: string): Promise<SignalData | null> {
  const funding = await getFundingRate(pair);
  const klines = await getKlines(pair, '1h', 20);
  const oi = await getOpenInterest(pair);
  if (!funding) return null;
  const rate = parseFloat(funding.fundingRate ?? '0');
  const detected = detectFundingExtreme(klines, pair, rate, oi?.openInterest ?? 'N/A');
  return detected ? { ...detected, pair, timeframe: '1h' } : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Strategy 5: Reversão após Liquidação em Massa
// ─────────────────────────────────────────────────────────────────────────
export function detectMassLiquidation(klines: Kline[], pair: string, timeframe: string): DetectedSignal | null {
  if ((klines?.length ?? 0) < 15) return null;

  const last5 = klines.slice(-5);
  const prev10 = klines.slice(-15, -5);
  const avgMove = prev10.reduce((sum: number, k: Kline) => sum + Math.abs((k?.close ?? 0) - (k?.open ?? 0)), 0) / (prev10?.length ?? 1);
  const lastMove = last5.reduce((sum: number, k: Kline) => sum + Math.abs((k?.close ?? 0) - (k?.open ?? 0)), 0) / (last5?.length ?? 1);

  if (lastMove < avgMove * 3) return null;

  const last = klines[klines.length - 1];
  if (!last) return null;
  const cascadeDown = last5.every((k: Kline) => (k?.close ?? 0) < (k?.open ?? 0));
  const cascadeUp = last5.every((k: Kline) => (k?.close ?? 0) > (k?.open ?? 0));

  if (!cascadeDown && !cascadeUp) return null;

  const dir = cascadeDown ? 'LONG' : 'SHORT';
  const atr = calcATR(klines);
  const mult = stopTierMultiplier(pair);
  const mode = timeframe === '5m' || timeframe === '15m' ? 'Day Trade' : 'Swing Trade';

  return {
    strategyId: 5,
    strategyName: 'Revers\u00e3o ap\u00f3s Liquida\u00e7\u00e3o',
    direction: dir as 'LONG' | 'SHORT',
    mode,
    entryPrice: last.close,
    target1: dir === 'LONG' ? last.close + atr * 2 : last.close - atr * 2,
    target2: dir === 'LONG' ? last.close + atr * 3.5 : last.close - atr * 3.5,
    stopLoss: dir === 'LONG' ? last.low - atr * mult : last.high + atr * mult,
    leverage: tieredLeverage(3, 5, pair),
    confidence: 65,
    reason: `Poss\u00edvel liquida\u00e7\u00e3o em massa detectada. Movimento ${cascadeDown ? 'de queda' : 'de alta'} excessivo ${((lastMove / avgMove) * 100 - 100).toFixed(0)}% acima da m\u00e9dia em ${timeframe}.`,
  };
}

export async function analyzeMassLiquidation(pair: string, timeframe: string): Promise<SignalData | null> {
  const klines = await getKlines(pair, timeframe, 30);
  const detected = detectMassLiquidation(klines, pair, timeframe);
  return detected ? { ...detected, pair, timeframe } : null;
}

// ─────────────────────────────────────────────────────────────────────────
// Strategy 6: Continuação após Compressão de Volatilidade
// ─────────────────────────────────────────────────────────────────────────
export function detectVolatilitySqueeze(klines: Kline[], pair: string, timeframe: string): DetectedSignal | null {
  if ((klines?.length ?? 0) < 30) return null;

  const atrFull = calcATR(klines.slice(0, -5), 14);
  const atrRecent = calcATR(klines.slice(-10), 5);

  // Afrouxado em 12/08/2026: com o limiar original (0.5 e 0.8), o scan de
  // 100 moedas achou só 19 sinais em 300 combinações em 2 meses — cada
  // combinação disparava, em média, 1x a cada 2,6 anos. Restritivo demais
  // pra sequer avaliar se a estratégia tem qualidade. Novos limiares:
  // squeeze até 65% do normal (era 50%), rompimento a partir de 50% do
  // ATR normal (era 80%).
  if (atrFull === 0 || atrRecent > atrFull * 0.65) return null;

  const last = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  if (!last || !prev) return null;

  const breakout = Math.abs(last.close - last.open) > atrFull * 0.5;
  if (!breakout) return null;

  const dir = last.close > last.open ? 'LONG' : 'SHORT';
  const mult = stopTierMultiplier(pair);
  const mode = timeframe === '1h' ? 'Day Trade' : 'Swing Trade';

  return {
    strategyId: 6,
    strategyName: 'Compress\u00e3o de Volatilidade',
    direction: dir as 'LONG' | 'SHORT',
    mode,
    entryPrice: last.close,
    target1: dir === 'LONG' ? last.close + atrFull * 2 : last.close - atrFull * 2,
    target2: dir === 'LONG' ? last.close + atrFull * 4 : last.close - atrFull * 4,
    stopLoss: dir === 'LONG' ? last.low - atrFull * 0.5 * mult : last.high + atrFull * 0.5 * mult,
    leverage: mode === 'Day Trade' ? tieredLeverage(5, 10, pair) : tieredLeverage(3, 5, pair),
    confidence: 70,
    reason: `Squeeze de volatilidade em ${timeframe}. ATR recente ${((1 - atrRecent / atrFull) * 100).toFixed(0)}% abaixo do normal. Breakout ${dir === 'LONG' ? 'altista' : 'baixista'} confirmado.`,
  };
}

export async function analyzeVolatilitySqueeze(pair: string, timeframe: string): Promise<SignalData | null> {
  const klines = await getKlines(pair, timeframe, 50);
  const detected = detectVolatilitySqueeze(klines, pair, timeframe);
  return detected ? { ...detected, pair, timeframe } : null;
}

export const STRATEGY_DEFS = [
  { id: 1, name: 'Rompimento de Range', timeframes: ['15m', '1h', '4h'], analyze: analyzeRangeBreakout },
  // Pausada manualmente em 05/09/2026 (scripts/pause-pullback-ema20.ts) —
  // expectância líquida negativa (-0,263%, amostra suficiente) confirmada
  // por 3 análises independentes (Fase 3, stability-check, peso da Fase 7),
  // rodando em 12 pares ao vivo (bem além dos 3 originalmente validados).
  // A pausa é por config (UserSettings.pairStrategies), não por código — a
  // detecção continua existindo aqui, só não está mais habilitada pra
  // nenhum par no momento. Reativação é manual, em Configurações →
  // Estratégia por Moeda, ou editando pairStrategies.
  { id: 2, name: 'Pullback na EMA20', timeframes: ['1h'], analyze: analyzePullbackEMA },
  // 4h removido em 03/09/2026: duas evidências independentes convergindo.
  // (1) Scan de backtest de 3 meses em 21 pares: PF médio 0,76 no 4h, só
  // 2 de 21 pares lucrativos — contra PF médio 0,84 no 1h (que também é
  // fraco sozinho, mas vira viável com o filtro de regime abaixo).
  // (2) Testado ao vivo o mesmo dia: tentamos validar com o filtro de
  // regime em AVAXUSDT/BCHUSDT/DOTUSDT (só 1h) e, à parte, todo teste em
  // 4h feito nessa mesma rodada mostrou treino/teste inconsistentes no
  // holdout formal (lib/walk-forward.ts). 1h é onde a estratégia
  // realmente tem chance — com filtro de regime, restrita a ETH/SOL/ADA
  // (ver REGIME_GATED_STRATEGIES_LIVE em lib/analysis-engine.ts).
  // 5m removido em 06/08/2026: scan de 294 combinações mostrou PF entre
  // 0,19 e 0,47 em TODOS os majors testados nesse timeframe (BTC, ETH, BNB,
  // XRP, TRX), com amostras de 300-385 trades cada e drawdown de até 60% —
  // não é ruído, é um padrão estrutural. 15m e 1h continuam ativos.
  // 15m removido em 06/08/2026: mesmo com amostra de 218-244 trades por
  // moeda, só 2 de 21 ficaram levemente positivas (PF 1.04-1.16) — praticamente
  // o mesmo padrão fraco do 5m. 1h é onde a estratégia realmente funciona
  // (4 moedas com PF>=1.0 e amostra razoável), restrito por moeda em
  // Configurações → Estratégia por Moeda.
  { id: 3, name: 'Trap de Liquidez', timeframes: ['1h'], analyze: analyzeLiquidityTrap },
  { id: 4, name: 'Funding Extremo', timeframes: ['1h'], analyze: analyzeFundingExtreme },
  // 15m removido em 12/08/2026: scan de 100 moedas mostrou PF médio de
  // 0,88 e só 17% das combinações lucrativas nesse timeframe (contra
  // PF 1,48 e 63,5% de acerto em 5m, com amostra de 85 moedas) — 5m é
  // onde essa estratégia realmente funciona.
  { id: 5, name: 'Revers\u00e3o ap\u00f3s Liquida\u00e7\u00e3o', timeframes: ['5m'], analyze: analyzeMassLiquidation },
  { id: 6, name: 'Compress\u00e3o de Volatilidade', timeframes: ['1h', '4h', '1d'], analyze: analyzeVolatilitySqueeze },
];
