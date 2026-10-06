// Tendência diária em paper (protótipo, 06/10/2026) — módulo SEPARADO das 6
// estratégias de sinal: não cria Signal (não contamina as estatísticas
// oficiais), não executa ordem, só mantém um livro-caixa de "exposição alvo
// por ativo" decidida no fechamento de cada dia UTC e a curva de capital
// resultante, avaliada como portfólio (não por WIN/LOSS por sinal).
//
// Origem: auditoria de estratégias de 06/10/2026. A literatura (Zarattini/
// Pagani/Barbon, "Catching Crypto Trends") aponta trend following em candles
// diários — ensemble de canais Donchian + dimensionamento por volatilidade —
// como a vantagem mais bem documentada em cripto. Backtest nosso
// (scripts/research-trend-ensemble.ts, 15 pares, 2021→hoje, regra fixada
// antes do resultado): CAGR 22.8%, Sharpe 0.93, queda máxima -40% contra
// BTC buy&hold -77% (Sharpe 0.62). O ganho é sobretudo controle de queda, não
// retorno extra; 2024→hoje piorou (Sharpe 0.63) e o universo tem viés de
// sobrevivência (pares que existem hoje). Este livro-caixa é o teste à frente.
//
// Regra (NÃO ajustar sem registrar nova versão — o valor do teste à frente
// depende de a regra não mudar depois de ver o resultado):
//   - por ativo e por prazo n em LOOKBACKS: long quando o fechamento rompe a
//     máxima dos n dias anteriores; sai quando perde a mínima dos n dias
//     anteriores. Long-only.
//   - sinal do ativo = média dos estados (0..1) dos prazos com histórico
//   - peso = sinal × min(1, SIGMA_TARGET / vol30d) / N ativos, sem alavancagem
//   - decide no fechamento do dia D; o peso rende a partir do dia D+1
//
// Os estados do Donchian dependem do ponto de partida do histórico, então o
// histórico é SEMPRE buscado de uma âncora fixa (ANCHOR) — o sinal de uma data
// não muda conforme o dia em que é calculado.
import { prisma } from './prisma';
import { getHistoricalKlines } from './binance';

export const TREND_PAPER_STATE_KEY = 'trend_paper_ledger';

// Mesmo universo do backtest de pesquisa. ponytail: lista fixa (viés de
// sobrevivência assumido) — trocar por universo dinâmico só se o teste à frente
// justificar o esforço.
export const TREND_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'LINKUSDT', 'LTCUSDT', 'TRXUSDT',
  'DOTUSDT', 'AVAXUSDT', 'BCHUSDT', 'XLMUSDT', 'UNIUSDT', 'DOGEUSDT', 'SOLUSDT',
];
const LOOKBACKS = [5, 10, 20, 30, 60, 90, 150, 250, 360];
const MIN_LOOKBACKS_USED = 3;
const SIGMA_TARGET = 0.5; // vol anualizada alvo por ativo
const COST_PER_SIDE = 0.0007; // 0,05% taxa + 0,02% slippage, sobre o giro de exposição
const ANCHOR = Date.UTC(2022, 0, 1);
const DAY_MS = 86400_000;

export interface DailySeries { dates: string[]; h: number[]; l: number[]; c: number[] } // contíguo, só candles fechados

export interface TrendRecord {
  date: string; // dia UTC do candle fechado em que a decisão foi tomada
  signals: Record<string, number>;
  weights: Record<string, number>; // exposição alvo (fração do capital) valendo a partir do dia seguinte
  gross: number; // retorno do dia dos pesos do registro anterior
  cost: number; // custo do giro de hoje (fração do capital)
  equity: number; // capital, começa em 1
  btcClose: number; // pra comparar com BTC buy&hold sem rede
}

export interface TrendLedger { version: 1; startDate: string; records: TrendRecord[] }

export const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Sinal (0..1) e vol 30d anualizada por dia — só usa dados até o próprio dia (sem look-ahead). */
export function computeSignalSeries(s: DailySeries): { sig: number[]; vol: number[] } {
  const n = s.c.length;
  const sig: number[] = Array(n).fill(NaN), vol: number[] = Array(n).fill(NaN);
  const state = LOOKBACKS.map(() => 0);
  for (let d = 1; d < n; d++) {
    if (d >= 30) {
      let sum = 0, sum2 = 0;
      for (let j = d - 29; j <= d; j++) { const r = Math.log(s.c[j] / s.c[j - 1]); sum += r; sum2 += r * r; }
      const m = sum / 30;
      vol[d] = Math.sqrt(Math.max(0, (sum2 - 30 * m * m) / 29)) * Math.sqrt(365);
    }
    let used = 0, acc = 0;
    LOOKBACKS.forEach((lb, i) => {
      if (d < lb) return;
      let hi = -Infinity, lo = Infinity;
      for (let j = d - lb; j < d; j++) { if (s.h[j] > hi) hi = s.h[j]; if (s.l[j] < lo) lo = s.l[j]; }
      if (state[i] === 0 && s.c[d] > hi) state[i] = 1; else if (state[i] === 1 && s.c[d] < lo) state[i] = 0;
      used++; acc += state[i];
    });
    if (used >= MIN_LOOKBACKS_USED) sig[d] = acc / used;
  }
  return { sig, vol };
}

export interface Prepared { s: DailySeries; sig: number[]; vol: number[]; idx: Map<string, number> }

export function prepare(series: Map<string, DailySeries>): Map<string, Prepared> {
  const out = new Map<string, Prepared>();
  for (const [pair, s] of series) {
    const { sig, vol } = computeSignalSeries(s);
    out.set(pair, { s, sig, vol, idx: new Map(s.dates.map((d, i) => [d, i])) });
  }
  return out;
}

/** Registro de uma data a partir do anterior (null = primeiro). Função pura. */
export function buildRecord(prev: TrendRecord | null, date: string, prepared: Map<string, Prepared>): TrendRecord {
  const live = TREND_PAIRS.filter((p) => {
    const P = prepared.get(p), i = P?.idx.get(date);
    return P !== undefined && i !== undefined && !isNaN(P.sig[i]) && !isNaN(P.vol[i]);
  });
  const signals: Record<string, number> = {}, weights: Record<string, number> = {};
  for (const p of live) {
    const P = prepared.get(p)!, i = P.idx.get(date)!;
    signals[p] = Math.round(P.sig[i] * 1000) / 1000;
    weights[p] = (P.sig[i] * Math.min(1, SIGMA_TARGET / P.vol[i])) / live.length;
  }

  let gross = 0;
  if (prev) {
    for (const [p, w] of Object.entries(prev.weights)) {
      const P = prepared.get(p), i = P?.idx.get(date), j = P?.idx.get(prev.date);
      if (P && i !== undefined && j !== undefined) gross += w * (P.s.c[i] / P.s.c[j] - 1);
    }
  }
  let turnover = 0;
  for (const p of new Set([...Object.keys(weights), ...Object.keys(prev?.weights ?? {})])) turnover += Math.abs((weights[p] ?? 0) - (prev?.weights[p] ?? 0));
  const cost = turnover * COST_PER_SIDE;

  const btc = prepared.get('BTCUSDT')!;
  return {
    date,
    signals,
    weights: Object.fromEntries(Object.entries(weights).map(([p, w]) => [p, Math.round(w * 1e6) / 1e6])),
    gross,
    cost,
    equity: (prev?.equity ?? 1) * (1 + gross - cost),
    btcClose: btc.s.c[btc.idx.get(date)!],
  };
}

/** Busca o histórico diário desde a âncora, só candles já fechados, em paralelo. */
export async function fetchDailySeries(now: number = Date.now()): Promise<Map<string, DailySeries>> {
  const entries = await Promise.all(TREND_PAIRS.map(async (pair) => {
    const ks = (await getHistoricalKlines(pair, '1d', ANCHOR, now)).filter((k) => k.closeTime < now);
    const s: DailySeries = { dates: ks.map((k) => utcDate(k.openTime)), h: ks.map((k) => k.high), l: ks.map((k) => k.low), c: ks.map((k) => k.close) };
    return [pair, s] as const;
  }));
  return new Map(entries);
}

/** Pura: gera os registros de `fromDate` (exclusive, ou o primeiro se prev=null) até `toDate`. */
export function buildRecords(prev: TrendRecord | null, toDate: string, prepared: Map<string, Prepared>, firstDate?: string): TrendRecord[] {
  const btcDates = prepared.get('BTCUSDT')!.s.dates;
  const out: TrendRecord[] = [];
  let last = prev;
  for (const date of btcDates) {
    if (date > toDate) break;
    if (last ? date <= last.date : date < (firstDate ?? toDate)) continue;
    last = buildRecord(last, date, prepared);
    out.push(last);
  }
  return out;
}

async function loadLedger(key: string): Promise<TrendLedger | null> {
  const row = await prisma.systemState.findUnique({ where: { key } });
  return row ? (JSON.parse(row.value) as TrendLedger) : null;
}

/**
 * Chamado a cada ciclo do agendador, mas só faz rede quando falta o registro
 * do último dia UTC fechado (1x por dia). Primeira execução cria o livro-caixa
 * começando no último dia fechado; execuções seguintes preenchem os dias que
 * faltarem (inclusive se o agendador ficou parado). Nunca lança pra fora do
 * ciclo quem chama deve envolver em try/catch. ponytail: livro-caixa como JSON
 * em SystemState (~250KB/ano) e sem trava de concorrência — migrar pra tabela
 * própria se crescer ou se dois ciclos simultâneos virarem problema real.
 */
export async function updateTrendPaperIfDue(now: number = Date.now(), key: string = TREND_PAPER_STATE_KEY): Promise<{ added: number; latest: TrendRecord | null }> {
  if (process.env.TREND_PAPER_DISABLED === 'true') return { added: 0, latest: null };

  const ledger = await loadLedger(key);
  const lastClosedDate = utcDate(now - DAY_MS);
  const lastRecord = ledger?.records[ledger.records.length - 1] ?? null;
  if (lastRecord && lastRecord.date >= lastClosedDate) return { added: 0, latest: lastRecord };

  const prepared = prepare(await fetchDailySeries(now));
  const btcDates = prepared.get('BTCUSDT')!.s.dates;
  const latestAvailable = btcDates[btcDates.length - 1];
  if (!latestAvailable || (lastRecord && latestAvailable <= lastRecord.date)) return { added: 0, latest: lastRecord }; // Binance ainda não publicou

  const newRecords = buildRecords(lastRecord, latestAvailable, prepared, latestAvailable);
  if (!newRecords.length) return { added: 0, latest: lastRecord };

  const next: TrendLedger = { version: 1, startDate: ledger?.startDate ?? newRecords[0].date, records: [...(ledger?.records ?? []), ...newRecords] };
  await prisma.systemState.upsert({ where: { key }, update: { value: JSON.stringify(next) }, create: { key, value: JSON.stringify(next) } });
  return { added: newRecords.length, latest: newRecords[newRecords.length - 1] };
}

export interface TrendPaperStatus {
  startDate: string;
  lastDate: string;
  days: number; // dias de operação desde o início (sem contar o dia de partida)
  returnPct: number;
  btcReturnPct: number;
  maxDrawdownPct: number;
  exposurePct: number; // soma dos pesos atuais
  positions: { pair: string; signal: number; weightPct: number }[];
  curve: { d: string; e: number; b: number }[]; // capital e BTC buy&hold, ambos normalizados em 1 no início
}

/** Só lê o livro-caixa — sem rede. null se ainda não começou. */
export async function getTrendPaperStatus(key: string = TREND_PAPER_STATE_KEY): Promise<TrendPaperStatus | null> {
  const ledger = await loadLedger(key);
  if (!ledger?.records.length) return null;
  const rs = ledger.records, first = rs[0], last = rs[rs.length - 1];
  let peak = 1, mdd = 0;
  for (const r of rs) { peak = Math.max(peak, r.equity); mdd = Math.min(mdd, r.equity / peak - 1); }
  return {
    startDate: ledger.startDate,
    lastDate: last.date,
    days: rs.length - 1,
    returnPct: (last.equity - 1) * 100,
    btcReturnPct: (last.btcClose / first.btcClose - 1) * 100,
    maxDrawdownPct: mdd * 100,
    exposurePct: Object.values(last.weights).reduce((a, b) => a + b, 0) * 100,
    positions: Object.entries(last.weights).filter(([, w]) => w > 0).sort((a, b) => b[1] - a[1])
      .map(([pair, w]) => ({ pair, signal: last.signals[pair], weightPct: w * 100 })),
    curve: rs.slice(-120).map((r) => ({ d: r.date, e: r.equity, b: r.btcClose / first.btcClose })),
  };
}
