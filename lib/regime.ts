import { Kline } from './binance';
import { calcEMA, calcATR, calcVWAP } from './indicators';

export type MarketRegime =
  | 'ALTA'
  | 'ALTA_CORRECAO'
  | 'BAIXA'
  | 'BAIXA_CORRECAO'
  | 'LATERALIZACAO'
  | 'ALTA_VOLATILIDADE_SEM_DIRECAO';

export interface RegimeClassification {
  regime: MarketRegime;
  // 0 a 1 — quantos dos 3 sinais (estrutura EMA50/200, timing EMA20/50,
  // preço vs VWAP) concordam com a direção dominante. 1 = tudo alinhado.
  force: number;
  // Falso quando o volume recente murchou bem abaixo do normal do próprio
  // ativo, mesmo ele estando no universo (top 100 por volume de 24h) —
  // protege contra pico de volume isolado que já passou.
  hasQuality: boolean;
  details: {
    price: number;
    ema20: number;
    ema50: number;
    ema200: number;
    vwap: number | null;
    atrRatio: number; // ATR recente / ATR normal
    volumeRatio: number; // volume recente médio / volume normal médio
  };
}

// Estrutura (EMA50 vs EMA200) só conta como "com direção" se a distância
// entre elas for relevante — perto demais/cruzando é tratado como sem
// estrutura clara (cai em lateralização ou alta-vol-sem-direção).
const STRUCTURE_MIN_GAP_PCT = 0.3;

// ATR recente 30% acima do normal já é considerado expansão de
// volatilidade relevante (mesma régua da Compressão de Volatilidade).
// Exportado (23/10/2026) pra lib/strategies.ts reusar o mesmo limiar no
// gate de rompimento falso do Rompimento de Range — ver detectRangeBreakout.
export const VOLATILITY_EXPANSION_RATIO = 1.3;

// Volume recente abaixo de 30% do volume "normal" do próprio ativo é
// sinal de liquidez murchando, mesmo que o par esteja no universo.
const MIN_VOLUME_RATIO = 0.3;

const MIN_KLINES_REQUIRED = 210; // EMA200 precisa de folga pra ficar estável

export function classifyRegime(klines: Kline[]): RegimeClassification | null {
  if ((klines?.length ?? 0) < MIN_KLINES_REQUIRED) return null;

  const closes = klines.map((k) => k.close);
  const last = klines[klines.length - 1];
  const price = last.close;

  const ema20Series = calcEMA(closes, 20);
  const ema50Series = calcEMA(closes, 50);
  const ema200Series = calcEMA(closes, 200);
  const ema20 = ema20Series[ema20Series.length - 1] ?? 0;
  const ema50 = ema50Series[ema50Series.length - 1] ?? 0;
  const ema200 = ema200Series[ema200Series.length - 1] ?? 0;

  const vwap = calcVWAP(klines);

  // ── Volatilidade: recente vs normal (mesmo estilo da Compressão) ──────
  const atrNormal = calcATR(klines.slice(0, -5), 14);
  const atrRecent = calcATR(klines.slice(-10), 5);
  const atrRatio = atrNormal > 0 ? atrRecent / atrNormal : 1;

  // ── Qualidade: volume recente vs volume normal do próprio ativo ───────
  const recentVols = klines.slice(-10).map((k) => k.volume);
  const normalVols = klines.slice(-60, -10).map((k) => k.volume);
  const avgRecentVol = recentVols.reduce((a, b) => a + b, 0) / (recentVols.length || 1);
  const avgNormalVol = normalVols.reduce((a, b) => a + b, 0) / (normalVols.length || 1);
  const volumeRatio = avgNormalVol > 0 ? avgRecentVol / avgNormalVol : 1;
  const hasQuality = volumeRatio >= MIN_VOLUME_RATIO;

  // ── Estrutura + timing ─────────────────────────────────────────────────
  const structureGapPct = ema200 > 0 ? (Math.abs(ema50 - ema200) / ema200) * 100 : 0;
  const hasStructure = structureGapPct > STRUCTURE_MIN_GAP_PCT;

  const structureSign = ema50 > ema200 ? 1 : ema50 < ema200 ? -1 : 0;
  const timing1Sign = ema20 > ema50 ? 1 : ema20 < ema50 ? -1 : 0;
  const timing2Sign = vwap !== null ? (price > vwap ? 1 : price < vwap ? -1 : 0) : 0;

  const signs = [structureSign, timing1Sign, timing2Sign];
  const upVotes = signs.filter((s) => s === 1).length;
  const downVotes = signs.filter((s) => s === -1).length;
  const force = Math.max(upVotes, downVotes) / 3;

  let regime: MarketRegime;

  if (!hasStructure) {
    regime = atrRatio > VOLATILITY_EXPANSION_RATIO ? 'ALTA_VOLATILIDADE_SEM_DIRECAO' : 'LATERALIZACAO';
  } else if (structureSign > 0) {
    const timingAligned = timing1Sign > 0 && timing2Sign > 0;
    regime = timingAligned ? 'ALTA' : 'ALTA_CORRECAO';
  } else {
    const timingAligned = timing1Sign < 0 && timing2Sign < 0;
    regime = timingAligned ? 'BAIXA' : 'BAIXA_CORRECAO';
  }

  return {
    regime,
    force,
    hasQuality,
    details: { price, ema20, ema50, ema200, vwap, atrRatio, volumeRatio },
  };
}
