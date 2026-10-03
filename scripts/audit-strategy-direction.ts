/**
 * Auditoria de uma estratégia por par × timeframe × direção, no histórico.
 * Só leitura — não grava nada no banco.
 *
 * Duas etapas (a coleta é lenta, então dá pra dividir os pares em vários
 * processos em paralelo; cada um grava um JSON por combinação em --out):
 *
 *   coleta:  npx tsx --require dotenv/config scripts/audit-strategy-direction.ts \
 *              --strategy=1 --pairs=BTCUSDT,ETHUSDT --tfs=15m,1h,4h --months=6 --out=<dir>
 *   resumo:  npx tsx --require dotenv/config scripts/audit-strategy-direction.ts \
 *              --summarize --strategy=1 --out=<dir>
 *
 * Origem (03/10/2026): na auditoria da Trap de Liquidez (#3) o corte por
 * regime×direção não se sustentou no backtest longo; aqui o corte por
 * direção é o primeiro a olhar nas #1 e #6, que viraram o maior risco.
 *
 * "Efetivo" = o que roda ao vivo: onde há gate de regime (ver
 * REGIME_GATED_STRATEGIES_BY_TF em lib/analysis-engine.ts) só conta o trade
 * aceito pelo filtro; nos demais timeframes conta tudo.
 */
import fs from 'fs';
import path from 'path';
import { backtestRegimeFilteredStrategy } from '../lib/radar-context-backtest';

// Espelha REGIME_GATED_STRATEGIES_BY_TF de lib/analysis-engine.ts (não é exportado).
const LIVE_GATED_TFS: Record<number, string[]> = { 1: ['1h', '15m'] };

interface Row { t: number; d: 'LONG' | 'SHORT'; r: string | null; s: 'WIN' | 'LOSS'; p: number; a: 0 | 1 }
interface Combo { strategyId: number; pair: string; tf: string; months: number; rows: Row[] }

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const strategyId = Number(arg('strategy'));
const outDir = arg('out');
if (!strategyId || !outDir) { console.error('Uso: --strategy=<id> --out=<dir> [--pairs=A,B --tfs=15m,1h --months=6 | --summarize]'); process.exit(1); }

const stat = (rows: Row[]) => {
  const n = rows.length;
  const w = rows.filter((r) => r.s === 'WIN').length;
  const gain = rows.filter((r) => r.p > 0).reduce((a, r) => a + r.p, 0);
  const loss = -rows.filter((r) => r.p < 0).reduce((a, r) => a + r.p, 0);
  const pf = loss ? gain / loss : n ? Infinity : 0;
  return `n=${String(n).padStart(3)} WR=${n ? String(Math.round((100 * w) / n)).padStart(3) : '  -'}% PF=${pf === Infinity ? ' inf' : pf.toFixed(2)} soma=${rows.reduce((a, r) => a + r.p, 0).toFixed(1)}%`;
};

async function collect() {
  const pairs = (arg('pairs') ?? '').split(',').filter(Boolean);
  const tfs = (arg('tfs') ?? '').split(',').filter(Boolean);
  const months = Number(arg('months') ?? 6);
  fs.mkdirSync(outDir!, { recursive: true });
  for (const pair of pairs) {
    for (const tf of tfs) {
      const file = path.join(outDir!, `s${strategyId}-${pair}-${tf}.json`);
      if (fs.existsSync(file)) { console.log(`${pair} ${tf} — já coletado, pulando`); continue; }
      try {
        const r = await backtestRegimeFilteredStrategy({ strategyId, pair, timeframe: tf, months });
        const accepted = new Set(r.acceptedTrades.map((t) => t.entryTime.getTime()));
        const rows: Row[] = r.allTrades.map((t) => ({ t: t.entryTime.getTime(), d: t.direction, r: t.regime, s: t.status, p: t.pnlPercent, a: accepted.has(t.entryTime.getTime()) ? 1 : 0 }));
        fs.writeFileSync(file, JSON.stringify({ strategyId, pair, tf, months, rows } satisfies Combo));
        console.log(`${pair} ${tf} — ok (${rows.length} trades)`);
      } catch (e: any) {
        console.log(`${pair} ${tf} — ERRO: ${e?.message?.slice(0, 150)}`);
      }
    }
  }
}

function summarize() {
  const combos: Combo[] = fs.readdirSync(outDir!).filter((f) => f.startsWith(`s${strategyId}-`) && f.endsWith('.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(outDir!, f), 'utf8')));
  if (!combos.length) { console.log('Nenhum arquivo coletado.'); return; }
  const gated = (tf: string) => (LIVE_GATED_TFS[strategyId] ?? []).includes(tf);
  const effective = (c: Combo) => (gated(c.tf) ? c.rows.filter((r) => r.a) : c.rows);
  const line = (label: string, rows: Row[]) => `  ${label.padEnd(22)} todos: ${stat(rows)} | LONG: ${stat(rows.filter((r) => r.d === 'LONG'))} | SHORT: ${stat(rows.filter((r) => r.d === 'SHORT'))}`;

  console.log(`=== Auditoria #${strategyId} — ${combos[0].months} meses, ${combos.length} combinações (efetivo = como roda ao vivo) ===\n`);
  const tfs = [...new Set(combos.map((c) => c.tf))];
  console.log('Por timeframe:');
  for (const tf of tfs) console.log(line(tf + (gated(tf) ? ' (c/ gate)' : ''), combos.filter((c) => c.tf === tf).flatMap(effective)));
  console.log('\nTotal efetivo:');
  console.log(line('todos os TFs', combos.flatMap(effective)));
  console.log('\nPor par (efetivo, todos os TFs):');
  const pairs = [...new Set(combos.map((c) => c.pair))].sort();
  for (const pair of pairs) console.log(line(pair, combos.filter((c) => c.pair === pair).flatMap(effective)));
  console.log('\nPor combinação par×timeframe (efetivo):');
  for (const c of combos.sort((a, b) => a.pair.localeCompare(b.pair) || a.tf.localeCompare(b.tf))) console.log(line(`${c.pair} ${c.tf}`, effective(c)));
}

(process.argv.includes('--summarize') ? Promise.resolve(summarize()) : collect())
  .catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
