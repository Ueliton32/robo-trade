const BASE = 'https://fapi.binance.com';

export interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface FundingRate {
  symbol: string;
  fundingRate: string;
  fundingTime: number;
}

export interface OpenInterest {
  symbol: string;
  openInterest: string;
  time: number;
}

export interface TickerPrice {
  symbol: string;
  price: string;
  time: number;
}

export interface Ticker24h {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  volume: string;
  quoteVolume: string;
  highPrice: string;
  lowPrice: string;
}

// Loga status/erro da Binance em vez de engolir em silêncio — até
// 01/09/2026 essas funções só retornavam vazio/null sem deixar rastro
// nenhum, então uma falha sistemática (ex: Binance bloqueando a região do
// servidor) ficava indistinguível de "mercado sem dado" até alguém
// desconfiar e investigar na mão.
function logBinanceHttpError(fn: string, status: number, statusText: string) {
  console.error(`[binance] ${fn} -> HTTP ${status} ${statusText}`);
}
function logBinanceFetchError(fn: string, e: any) {
  console.error(`[binance] ${fn} falhou:`, e?.message ?? e);
}

export async function getKlines(symbol: string, interval: string, limit = 100): Promise<Kline[]> {
  try {
    const res = await fetch(`${BASE}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, { next: { revalidate: 30 } });
    if (!res.ok) { logBinanceHttpError(`getKlines(${symbol})`, res.status, res.statusText); return []; }
    const data = await res.json();
    return (data ?? []).map((k: any) => ({
      openTime: k?.[0] ?? 0,
      open: parseFloat(k?.[1] ?? '0'),
      high: parseFloat(k?.[2] ?? '0'),
      low: parseFloat(k?.[3] ?? '0'),
      close: parseFloat(k?.[4] ?? '0'),
      volume: parseFloat(k?.[5] ?? '0'),
      closeTime: k?.[6] ?? 0,
    }));
  } catch (e: any) { logBinanceFetchError(`getKlines(${symbol})`, e); return []; }
}

export async function getFundingRate(symbol: string): Promise<FundingRate | null> {
  try {
    const res = await fetch(`${BASE}/fapi/v1/fundingRate?symbol=${symbol}&limit=1`, { next: { revalidate: 30 } });
    if (!res.ok) { logBinanceHttpError(`getFundingRate(${symbol})`, res.status, res.statusText); return null; }
    const data = await res.json();
    return data?.[0] ?? null;
  } catch (e: any) { logBinanceFetchError(`getFundingRate(${symbol})`, e); return null; }
}

export async function getOpenInterest(symbol: string): Promise<OpenInterest | null> {
  try {
    const res = await fetch(`${BASE}/fapi/v1/openInterest?symbol=${symbol}`, { next: { revalidate: 30 } });
    if (!res.ok) { logBinanceHttpError(`getOpenInterest(${symbol})`, res.status, res.statusText); return null; }
    return await res.json();
  } catch (e: any) { logBinanceFetchError(`getOpenInterest(${symbol})`, e); return null; }
}

export async function getTicker24h(symbol: string): Promise<Ticker24h | null> {
  try {
    const res = await fetch(`${BASE}/fapi/v1/ticker/24hr?symbol=${symbol}`, { next: { revalidate: 15 } });
    if (!res.ok) { logBinanceHttpError(`getTicker24h(${symbol})`, res.status, res.statusText); return null; }
    return await res.json();
  } catch (e: any) { logBinanceFetchError(`getTicker24h(${symbol})`, e); return null; }
}

export async function getTickerPrice(symbol: string): Promise<TickerPrice | null> {
  try {
    const res = await fetch(`${BASE}/fapi/v1/ticker/price?symbol=${symbol}`, { next: { revalidate: 10 } });
    if (!res.ok) { logBinanceHttpError(`getTickerPrice(${symbol})`, res.status, res.statusText); return null; }
    return await res.json();
  } catch (e: any) { logBinanceFetchError(`getTickerPrice(${symbol})`, e); return null; }
}

export async function getAllFundingRates(): Promise<FundingRate[]> {
  try {
    const res = await fetch(`${BASE}/fapi/v1/premiumIndex`, { next: { revalidate: 30 } });
    if (!res.ok) { logBinanceHttpError('getAllFundingRates', res.status, res.statusText); return []; }
    const data = await res.json();
    return (data ?? []).map((d: any) => ({
      symbol: d?.symbol ?? '',
      fundingRate: d?.lastFundingRate ?? '0',
      fundingTime: d?.nextFundingTime ?? 0,
    }));
  } catch (e: any) { logBinanceFetchError('getAllFundingRates', e); return []; }
}

export interface ExchangeSymbolInfo {
  symbol: string;
  status: string;
  contractType: string;
  quoteAsset: string;
}

// Lista de todos os contratos futuros da Binance — usada pra montar o
// universo dinâmico (radar), não a lista fixa curada de sempre.
export async function getExchangeInfo(): Promise<ExchangeSymbolInfo[]> {
  try {
    const res = await fetch(`${BASE}/fapi/v1/exchangeInfo`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.symbols ?? []).map((s: any) => ({
      symbol: s?.symbol ?? '',
      status: s?.status ?? '',
      contractType: s?.contractType ?? '',
      quoteAsset: s?.quoteAsset ?? '',
    }));
  } catch { return []; }
}

// Ticker 24h de TODOS os símbolos numa chamada só (sem "?symbol="), usado
// pra ranquear por volume — bem mais barato que chamar par por par.
export async function getAll24hTickers(): Promise<Ticker24h[]> {
  try {
    const res = await fetch(`${BASE}/fapi/v1/ticker/24hr`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export interface OpenInterestPoint {
  symbol: string;
  sumOpenInterest: string;
  timestamp: number;
}

// Histórico de Open Interest — endpoint fica em /futures/data/, não em
// /fapi/v1/ (path diferente da maioria, mas mesmo host). Usado pro score
// do radar checar se o OI está subindo ou caindo, não só o valor atual.
export async function getOpenInterestHistory(symbol: string, period = '1h', limit = 8): Promise<OpenInterestPoint[]> {
  try {
    const res = await fetch(`${BASE}/futures/data/openInterestHist?symbol=${symbol}&period=${period}&limit=${limit}`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

export const MONITORED_PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];

// ── Histórico paginado, usado só pelo backtest ──────────────────────────
// (as funções acima buscam sempre "os N candles mais recentes"; estas
// aqui buscam uma janela de tempo específica no passado, em várias
// chamadas, respeitando o limite de 1000 candles por requisição da Binance).

function parseKline(k: any): Kline {
  return {
    openTime: k?.[0] ?? 0,
    open: parseFloat(k?.[1] ?? '0'),
    high: parseFloat(k?.[2] ?? '0'),
    low: parseFloat(k?.[3] ?? '0'),
    close: parseFloat(k?.[4] ?? '0'),
    volume: parseFloat(k?.[5] ?? '0'),
    closeTime: k?.[6] ?? 0,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MAX_RATE_LIMIT_RETRIES = 5;

// Backoff exponencial só pra 429 (peso excedido) e 418 (IP banido por
// ignorar 429 repetidos) — os dois jeitos da Binance dizer "câmera lenta".
// Respeita o header Retry-After quando ele vem; senão dobra a espera a
// cada tentativa (1s, 2s, 4s, 8s, 16s), até um teto de 30s. Sem isso, um
// scan grande (backtest-scan.ts roda ~294 combinações, cada uma paginando
// até 500x) podia insistir sem pausa em cima de um rate limit e escalar de
// "429 temporário" pra "418 banido" — que dura minutos, não segundos.
async function fetchWithBackoff(url: string, maxRetries: number = MAX_RATE_LIMIT_RETRIES): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url);
    if (res.status !== 429 && res.status !== 418) return res;
    if (attempt >= maxRetries) return res; // desiste — quem chamou já trata `!res.ok`

    const retryAfterHeader = res.headers.get('Retry-After');
    const retryAfterMs = retryAfterHeader ? parseFloat(retryAfterHeader) * 1000 : null;
    const backoffMs = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : Math.min(30_000, 1000 * 2 ** attempt);
    console.warn(`[binance] HTTP ${res.status} (rate limit) em ${url.split('?')[0]} — aguardando ${(backoffMs / 1000).toFixed(1)}s (tentativa ${attempt + 1}/${maxRetries}).`);
    await sleep(backoffMs);
  }
}

export async function getHistoricalKlines(
  symbol: string,
  interval: string,
  startTime: number,
  endTime: number
): Promise<Kline[]> {
  const all: Kline[] = [];
  let cursor = startTime;
  let guard = 0; // proteção contra loop infinito se a API devolver algo inesperado

  while (cursor < endTime && guard < 500) {
    guard++;
    const url = `${BASE}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&startTime=${cursor}&endTime=${endTime}&limit=1000`;
    const res = await fetchWithBackoff(url);
    if (!res.ok) break;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    const batch = data.map(parseKline);
    all.push(...batch);

    const lastCloseTime = batch[batch.length - 1]?.closeTime ?? cursor;
    if (lastCloseTime <= cursor) break; // não avançou, evita loop infinito
    cursor = lastCloseTime + 1;

    if (batch.length < 1000) break; // acabou o histórico disponível
    await sleep(200); // pausa educada entre chamadas
  }

  return all;
}

export async function getHistoricalFundingRates(
  symbol: string,
  startTime: number,
  endTime: number
): Promise<FundingRate[]> {
  const all: FundingRate[] = [];
  let cursor = startTime;
  let guard = 0;

  while (cursor < endTime && guard < 50) {
    guard++;
    const url = `${BASE}/fapi/v1/fundingRate?symbol=${symbol}&startTime=${cursor}&endTime=${endTime}&limit=1000`;
    const res = await fetchWithBackoff(url);
    if (!res.ok) break;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    all.push(...data.map((d: any) => ({
      symbol: d?.symbol ?? symbol,
      fundingRate: d?.fundingRate ?? '0',
      fundingTime: d?.fundingTime ?? 0,
    })));

    const last = data[data.length - 1]?.fundingTime ?? cursor;
    if (last <= cursor) break;
    cursor = last + 1;

    if (data.length < 1000) break;
    await sleep(200);
  }

  return all;
}
