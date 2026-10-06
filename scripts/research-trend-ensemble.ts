/**
 * Pesquisa (06/10/2026): a literatura (Zarattini/Pagani/Barbon, "Catching
 * Crypto Trends") aponta trend following em candles DIÁRIOS — ensemble de
 * canais Donchian de vários prazos + dimensionamento por volatilidade — como
 * a vantagem mais bem documentada em cripto. Aqui testamos isso nos NOSSOS
 * dados da Binance Futures antes de confiar no paper. Só leitura.
 *
 * Especificação (fixada ANTES de olhar o resultado, sem ajuste de parâmetro):
 *   - por ativo e por prazo n em LOOKBACKS: entra long quando o fechamento
 *     rompe a máxima dos n dias anteriores; sai quando perde a mínima dos n
 *     dias anteriores. Long-only.
 *   - sinal do ativo = média dos estados (0..1) dos prazos com histórico
 *   - exposição = sinal × min(1, SIGMA_TARGET / vol30d) × (1/N ativos), sem
 *     alavancagem (soma ≤ 100% do capital; o resto fica em caixa)
 *   - decide no fechamento do dia d, posição vale a partir do dia d+1 (sem
 *     look-ahead); custo por lado sobre o giro de exposição
 * Comparação: BTC buy&hold e cesta igual-ponderada rebalanceada diária.
 * ATENÇÃO survivorship: o universo é de pares que existem hoje.
 *
 *   npx tsx --require dotenv/config scripts/research-trend-ensemble.ts [--filter --audit=<dir>]
 *
 * Com --filter, testa também se o sinal diário de tendência melhora os LONGs
 * da estratégia 1 (1h/4h) do backtest de auditoria (scripts/audit-strategy-direction.ts).
 */
import fs from 'fs';
import path from 'path';
import { getHistoricalKlines } from '../lib/binance';

const PAIRS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'LINKUSDT', 'LTCUSDT', 'TRXUSDT', 'DOTUSDT', 'AVAXUSDT', 'BCHUSDT', 'XLMUSDT', 'UNIUSDT', 'DOGEUSDT', 'SOLUSDT'];
const LOOKBACKS_ALL = [5, 10, 20, 30, 60, 90, 150, 250, 360];
const DAY = 86400_000;
const FETCH_FROM = Date.UTC(2019, 8, 1);
const EVAL_FROM = Date.UTC(2021, 0, 1);

type Series = { h: number[]; l: number[]; c: number[] }; // indexado por dia desde FETCH_FROM, NaN se sem dado
const dayIdx = (t: number) => Math.floor((t - FETCH_FROM) / DAY);

async function load(): Promise<Map<string, Series>> {
  const now = Date.now(), nDays = dayIdx(now) + 1;
  const out = new Map<string, Series>();
  for (const p of PAIRS) {
    const ks = await getHistoricalKlines(p, '1d', FETCH_FROM, now);
    const s: Series = { h: Array(nDays).fill(NaN), l: Array(nDays).fill(NaN), c: Array(nDays).fill(NaN) };
    for (const k of ks) { const d = dayIdx(k.openTime); if (d >= 0 && d < nDays) { s.h[d] = k.high; s.l[d] = k.low; s.c[d] = k.close; } }
    out.set(p, s);
    console.log(`  ${p}: ${ks.length} candles diários`);
  }
  return out;
}

interface Cfg { pairs: string[]; lookbacks: number[]; costPerSide: number; sigmaTarget: number }

function run(data: Map<string, Series>, cfg: Cfg) {
  const nDays = data.get(cfg.pairs[0])!.c.length;
  const sig = new Map<string, number[]>(); // sinal 0..1 por dia (NaN = sem histórico)
  const vol = new Map<string, number[]>();
  for (const p of cfg.pairs) {
    const { h, l, c } = data.get(p)!;
    const states = cfg.lookbacks.map(() => 0);
    const s: number[] = Array(nDays).fill(NaN), v: number[] = Array(nDays).fill(NaN);
    for (let d = 1; d < nDays; d++) {
      if (isNaN(c[d])) continue;
      // vol 30d dos retornos log
      if (d >= 31 && !isNaN(c[d - 30])) {
        const rs: number[] = []; for (let j = d - 29; j <= d; j++) if (!isNaN(c[j]) && !isNaN(c[j - 1])) rs.push(Math.log(c[j] / c[j - 1]));
        if (rs.length >= 25) { const m = rs.reduce((a, b) => a + b, 0) / rs.length; v[d] = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (rs.length - 1)) * Math.sqrt(365); }
      }
      let used = 0, sum = 0;
      cfg.lookbacks.forEach((n, i) => {
        if (d < n || isNaN(c[d - n])) return;
        let hi = -Infinity, lo = Infinity, ok = true;
        for (let j = d - n; j < d; j++) { if (isNaN(h[j])) { ok = false; break; } hi = Math.max(hi, h[j]); lo = Math.min(lo, l[j]); }
        if (!ok) return;
        if (states[i] === 0 && c[d] > hi) states[i] = 1; else if (states[i] === 1 && c[d] < lo) states[i] = 0;
        used++; sum += states[i];
      });
      if (used >= 3) s[d] = sum / used;
    }
    sig.set(p, s); vol.set(p, v);
  }
  const ret: number[] = Array(nDays).fill(0), expo: number[] = Array(nDays).fill(0), prevW = new Map<string, number>();
  const ew: number[] = Array(nDays).fill(0);
  for (let d = 1; d < nDays - 0; d++) {
    // pesos decididos no fechamento de d-1, valem em d
    const live = cfg.pairs.filter((p) => !isNaN(sig.get(p)![d - 1]) && !isNaN(vol.get(p)![d - 1]));
    const N = live.length || 1;
    let r = 0, gross = 0, turnover = 0, ewr = 0, ewn = 0;
    const w = new Map<string, number>();
    for (const p of live) w.set(p, (sig.get(p)![d - 1] * Math.min(1, cfg.sigmaTarget / vol.get(p)![d - 1])) / N);
    for (const p of new Set([...w.keys(), ...prevW.keys()])) turnover += Math.abs((w.get(p) ?? 0) - (prevW.get(p) ?? 0));
    for (const p of live) {
      const c = data.get(p)!.c; if (isNaN(c[d]) || isNaN(c[d - 1])) continue;
      const rr = c[d] / c[d - 1] - 1; r += (w.get(p) ?? 0) * rr; gross += w.get(p) ?? 0; ewr += rr; ewn++;
    }
    ret[d] = r - turnover * cfg.costPerSide; expo[d] = gross; ew[d] = ewn ? ewr / ewn : 0;
    prevW.clear(); w.forEach((x, k) => prevW.set(k, x));
  }
  return { ret, expo, ew, sig, vol };
}

function stats(ret: number[], from: number, to: number = Infinity) {
  const r: number[] = []; for (let d = dayIdx(from); d < Math.min(ret.length, to === Infinity ? ret.length : dayIdx(to)); d++) r.push(ret[d]);
  let eq = 1, peak = 1, mdd = 0; for (const x of r) { eq *= 1 + x; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1); }
  const m = r.reduce((a, b) => a + b, 0) / r.length, sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  const years = r.length / 365, cagr = Math.pow(eq, 1 / years) - 1;
  return { cagr, vol: sd * Math.sqrt(365), sharpe: sd ? (m / sd) * Math.sqrt(365) : 0, mdd, total: eq - 1 };
}
const f = (x: number) => (100 * x).toFixed(1) + '%';
const row = (name: string, s: ReturnType<typeof stats>) => `  ${name.padEnd(34)} total ${f(s.total).padStart(8)} | CAGR ${f(s.cagr).padStart(7)} | vol ${f(s.vol).padStart(6)} | Sharpe ${s.sharpe.toFixed(2).padStart(5)} | maxDD ${f(s.mdd).padStart(7)}`;


function pfStat(r: number[]) {
  const g = r.filter((x) => x > 0).reduce((a, b) => a + b, 0), l = -r.filter((x) => x < 0).reduce((a, b) => a + b, 0);
  return `n=${String(r.length).padStart(3)} PF=${l ? (g / l).toFixed(2) : 'inf'} soma=${r.reduce((a, b) => a + b, 0).toFixed(1)}%`;
}

function filterTest(sigs: Map<string, number[]>, auditDir: string) {
  type Row = { t: number; d: string; s: string; p: number; a: number };
  const files = fs.readdirSync(auditDir).filter((f) => f.startsWith('s1-') && f.endsWith('.json'));
  const trades: { pair: string; tf: string; r: Row }[] = [];
  for (const f of files) {
    const c = JSON.parse(fs.readFileSync(path.join(auditDir, f), 'utf8'));
    if (c.tf === '15m') continue;
    for (const r of c.rows as Row[]) if (r.d === 'LONG' && (c.tf === '4h' || r.a)) trades.push({ pair: c.pair, tf: c.tf, r });
  }
  const sigAt = (pair: string, t: number) => sigs.get(pair)?.[dayIdx(t) - 1] ?? NaN;
  console.log(`
=== Filtro de tendência diária nos LONGs da #1 (1h c/ gate + 4h; ${trades.length} trades, ~6 meses) ===`);
  for (const [label, sel] of [['todos', () => true], ['só 1h', (x: any) => x.tf === '1h'], ['só 4h', (x: any) => x.tf === '4h']] as [string, (x: any) => boolean][]) {
    const set = trades.filter(sel);
    const btcOn = set.filter((x) => sigAt('BTCUSDT', x.r.t) >= 0.5), btcOff = set.filter((x) => sigAt('BTCUSDT', x.r.t) < 0.5);
    const own = set.filter((x) => !isNaN(sigAt(x.pair, x.r.t)));
    const ownOn = own.filter((x) => sigAt(x.pair, x.r.t) >= 0.5), ownOff = own.filter((x) => sigAt(x.pair, x.r.t) < 0.5);
    console.log(`  ${label}`);
    console.log(`    sem filtro            ${pfStat(set.map((x) => x.r.p))}`);
    console.log(`    BTC em tendência (≥0.5) ${pfStat(btcOn.map((x) => x.r.p))}   | BTC fora (<0.5) ${pfStat(btcOff.map((x) => x.r.p))}`);
    console.log(`    ativo em tendência      ${pfStat(ownOn.map((x) => x.r.p))}   | ativo fora        ${pfStat(ownOff.map((x) => x.r.p))}   (só pares da lista; ${own.length} de ${set.length})`);
  }
}

async function main() {
  console.log('Baixando candles diários (Binance Futures)...');
  const data = await load();
  const base: Cfg = { pairs: PAIRS, lookbacks: LOOKBACKS_ALL, costPerSide: 0.0007, sigmaTarget: 0.5 };
  const main = run(data, base);
  const btc = data.get('BTCUSDT')!.c; const btcRet = btc.map((x, i) => (i && !isNaN(x) && !isNaN(btc[i - 1]) ? x / btc[i - 1] - 1 : 0));

  const periods: [string, number, number][] = [
    ['2021-01 → hoje (tudo)', EVAL_FROM, Infinity],
    ['2021-01 → 2023-12 (1ª metade)', EVAL_FROM, Date.UTC(2024, 0, 1)],
    ['2024-01 → hoje (2ª metade)', Date.UTC(2024, 0, 1), Infinity],
    ['últimos 12 meses', Date.now() - 365 * DAY, Infinity],
  ];
  for (const [label, a, b] of periods) {
    console.log(`\n=== ${label} ===`);
    console.log(row('Ensemble Donchian (15 pares)', stats(main.ret, a, b)));
    console.log(row('Cesta igual-ponderada (buy&hold)', stats(main.ew, a, b)));
    console.log(row('BTC buy&hold', stats(btcRet, a, b)));
  }
  const avgExpo = main.expo.slice(dayIdx(EVAL_FROM)).reduce((a, b) => a + b, 0) / (main.expo.length - dayIdx(EVAL_FROM));
  console.log(`\nExposição bruta média (2021→hoje): ${f(avgExpo)} do capital (o resto em caixa)`);

  console.log('\n=== Retorno por ano ===');
  for (let y = 2021; y <= new Date().getUTCFullYear(); y++) {
    const a = Date.UTC(y, 0, 1), b = Date.UTC(y + 1, 0, 1);
    console.log(`  ${y}: ensemble ${f(stats(main.ret, a, b).total).padStart(8)} | cesta ${f(stats(main.ew, a, b).total).padStart(8)} | BTC ${f(stats(btcRet, a, b).total).padStart(8)} | maxDD ensemble ${f(stats(main.ret, a, b).mdd)}`);
  }

  console.log('\n=== Sensibilidade (2021 → hoje) ===');
  const variants: [string, Cfg][] = [
    ['custo 3x (0,21%/lado)', { ...base, costPerSide: 0.0021 }],
    ['só prazos curtos (5-60d)', { ...base, lookbacks: [5, 10, 20, 30, 60] }],
    ['só prazos longos (60-360d)', { ...base, lookbacks: [60, 90, 150, 250, 360] }],
    ['só BTC + ETH', { ...base, pairs: ['BTCUSDT', 'ETHUSDT'] }],
    ['vol alvo 100% (mais agressivo)', { ...base, sigmaTarget: 1.0 }],
  ];
  for (const [name, cfg] of variants) console.log(row(name, stats(run(data, cfg).ret, EVAL_FROM)));

  const auditArg = process.argv.find((a) => a.startsWith('--audit='))?.split('=')[1];
  if (process.argv.includes('--filter') && auditArg) filterTest(main.sig, auditArg);

  console.log('\n=== Sinal HOJE (0 = fora, 1 = totalmente comprado) ===');
  const last = main.sig.get('BTCUSDT')!.length - 1;
  for (const p of PAIRS) { const s = main.sig.get(p)![last], v = main.vol.get(p)![last]; console.log(`  ${p.padEnd(9)} sinal=${isNaN(s) ? 's/ dado' : s.toFixed(2)} vol30d=${isNaN(v) ? '-' : f(v)}`); }
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); });
