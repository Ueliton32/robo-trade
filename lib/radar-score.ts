import { Kline, getKlines, getFundingRate, getOpenInterestHistory } from './binance';
import { classifyRegime, MarketRegime } from './regime';
import { calcMACD, calcROC, calcATR } from './indicators';
import { stopTierMultiplier } from './strategies';

export type Direction = 'LONG' | 'SHORT';
export type ScoreClassification = 'NAO_OPERAR' | 'OBSERVAR' | 'SINAL_QUALIFICADO' | 'SINAL_FORTE';

export interface ScoreBreakdown {
  trend: number;       // 0-25
  momentum: number;    // 0-20
  volume: number;      // 0-15
  openInterest: number;// 0-15
  funding: number;     // 0-10
  riskReward: number;  // 0-10
  liquidity: number;   // 0-5
}

export interface TradeLevels {
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  riskReward: number;
}

export interface RadarCandidate {
  pair: string;
  timeframe: string;
  direction: Direction | null;
  regime: MarketRegime | null;
  regimeForce: number | null;
  score: number;
  classification: ScoreClassification;
  breakdown: ScoreBreakdown;
  levels: TradeLevels | null;
  rejectionReason: string | null;
}

const ZERO_BREAKDOWN: ScoreBreakdown = { trend: 0, momentum: 0, volume: 0, openInterest: 0, funding: 0, riskReward: 0, liquidity: 0 };

function classify(score: number): ScoreClassification {
  if (score >= 85) return 'SINAL_FORTE';
  if (score >= 70) return 'SINAL_QUALIFICADO';
  if (score >= 50) return 'OBSERVAR';
  return 'NAO_OPERAR';
}

// Níveis genéricos pro radar (diferente dos detectXxx() curados, que cada
// um tem sua própria régua): stop na mínima/máxima recente (SEM incluir o
// candle atual — mesmo cuidado que corrigimos no Rompimento de Range) +
// margem de ATR por tier, alvo proporcional ao risco real (1.5:1 e 3:1).
function calcGenericLevels(klines: Kline[], direction: Direction, pair: string): TradeLevels | null {
  if (klines.length < 21) return null;

  const last = klines[klines.length - 1];
  const entry = last.close;
  const atr = calcATR(klines);
  const mult = stopTierMultiplier(pair);

  // Últimos 20 candles ANTES do atual — mesma lição do bug do Rompimento
  // de Range: nunca incluir o próprio candle no nível que ele vai testar.
  const swingWindow = klines.slice(-21, -1);
  const swingLow = Math.min(...swingWindow.map((k) => k.low));
  const swingHigh = Math.max(...swingWindow.map((k) => k.high));

  const stop = direction === 'LONG' ? swingLow - atr * 0.5 * mult : swingHigh + atr * 0.5 * mult;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;

  const target1 = direction === 'LONG' ? entry + risk * 1.5 : entry - risk * 1.5;
  const target2 = direction === 'LONG' ? entry + risk * 3 : entry - risk * 3;
  const riskReward = Math.abs(target1 - entry) / risk;

  return { entry, stop, target1, target2, riskReward };
}

/**
 * Pontua uma combinação par+timeframe seguindo a fórmula do documento:
 * tendência(25) + momentum(20) + volume(15) + open interest(15) +
 * funding(10) + risco/retorno(10) + liquidez(5) = 100.
 *
 * Os pesos são o ponto de partida sugerido pelo documento, não algo
 * validado por backtest ainda — tratar como hipótese testável, igual
 * fizemos com tudo até aqui.
 */
export async function scoreCandidate(pair: string, timeframe: string = '1h'): Promise<RadarCandidate> {
  const klines = await getKlines(pair, timeframe, 300);

  if (klines.length < 210) {
    return {
      pair, timeframe, direction: null, regime: null, regimeForce: null,
      score: 0, classification: 'NAO_OPERAR', breakdown: ZERO_BREAKDOWN, levels: null,
      rejectionReason: `Hist\u00f3rico insuficiente (${klines.length} candles, precisa de 210+)`,
    };
  }

  const regimeResult = classifyRegime(klines);
  if (!regimeResult) {
    return {
      pair, timeframe, direction: null, regime: null, regimeForce: null,
      score: 0, classification: 'NAO_OPERAR', breakdown: ZERO_BREAKDOWN, levels: null,
      rejectionReason: 'N\u00e3o foi poss\u00edvel classificar o regime',
    };
  }

  const direction: Direction | null =
    regimeResult.regime === 'ALTA' || regimeResult.regime === 'ALTA_CORRECAO' ? 'LONG' :
    regimeResult.regime === 'BAIXA' || regimeResult.regime === 'BAIXA_CORRECAO' ? 'SHORT' :
    null;

  if (!direction) {
    return {
      pair, timeframe, direction: null, regime: regimeResult.regime, regimeForce: regimeResult.force,
      score: 0, classification: 'NAO_OPERAR', breakdown: ZERO_BREAKDOWN, levels: null,
      rejectionReason: `Sem direção clara — regime é ${regimeResult.regime}`,
    };
  }

  // ── Tendência (25 pts) — regime cheio = pontos inteiros; em correção,
  // proporcional à força (quantos dos 3 sinais concordam) ─────────────────
  const fullyAligned = regimeResult.regime === 'ALTA' || regimeResult.regime === 'BAIXA';
  const trend = fullyAligned ? 25 : Math.round(25 * regimeResult.force);

  // ── Momentum (20 pts) — MACD e ROC apontando pra mesma direção ─────────
  const closes = klines.map((k) => k.close);
  const macd = calcMACD(closes);
  const roc = calcROC(closes);
  const macdAligned = macd ? (direction === 'LONG' ? macd.histogram > 0 : macd.histogram < 0) : false;
  const rocAligned = roc !== null ? (direction === 'LONG' ? roc > 0 : roc < 0) : false;
  const momentum = macdAligned && rocAligned ? 20 : macdAligned || rocAligned ? 10 : 0;

  // ── Volume (15 pts) — candle atual com volume acima do normal ──────────
  const last = klines[klines.length - 1];
  const prevVols = klines.slice(-11, -1).map((k) => k.volume);
  const avgVol = prevVols.reduce((a, b) => a + b, 0) / (prevVols.length || 1);
  const volume = avgVol > 0 && last.volume > avgVol * 1.3 ? 15 : 0;

  // ── Open Interest (15 pts) — confirma só quando preço e OI concordam
  // (tabela do documento: alta+OI subindo = confirmação real de LONG) ────
  const oiHistory = await getOpenInterestHistory(pair, '1h', 8);
  let openInterest = 0;
  if (oiHistory.length >= 2) {
    const oiFirst = parseFloat(oiHistory[0].sumOpenInterest ?? '0');
    const oiLast = parseFloat(oiHistory[oiHistory.length - 1].sumOpenInterest ?? '0');
    const oiUp = oiFirst > 0 && oiLast > oiFirst * 1.01;
    const priceRef = klines[klines.length - 1 - oiHistory.length]?.close ?? last.close;
    const priceUp = last.close > priceRef;
    if (direction === 'LONG' && priceUp && oiUp) openInterest = 15;
    if (direction === 'SHORT' && !priceUp && oiUp) openInterest = 15;
  }

  // ── Funding (10 pts) — não entrar atrasado contra funding extremo ──────
  const funding = await getFundingRate(pair);
  const fundingRate = funding ? parseFloat(funding.fundingRate ?? '0') : 0;
  const fundingOk = direction === 'LONG' ? fundingRate < 0.001 : fundingRate > -0.0005;
  const fundingScore = fundingOk ? 10 : 0;

  // ── Níveis + Risco/Retorno (10 pts) ─────────────────────────────────────
  const levels = calcGenericLevels(klines, direction, pair);
  const riskReward = levels ? 10 : 0; // calcGenericLevels já garante >=1.5:1 por construção

  // ── Liquidez (5 pts) — do próprio regime (volume recente vs normal) ────
  const liquidity = regimeResult.hasQuality ? 5 : 0;

  const breakdown: ScoreBreakdown = { trend, momentum, volume, openInterest, funding: fundingScore, riskReward, liquidity };
  const score = trend + momentum + volume + openInterest + fundingScore + riskReward + liquidity;

  return {
    pair, timeframe, direction, regime: regimeResult.regime, regimeForce: regimeResult.force,
    score, classification: classify(score), breakdown, levels, rejectionReason: null,
  };
}
