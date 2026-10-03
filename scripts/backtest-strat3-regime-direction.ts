/**
 * Backtest do corte "LONG em ALTA_CORRECAO" da Trap de Liquidez (id 3).
 *
 * Origem (03/10/2026): 28/09 teve -23.8% líquido, 15 de 16 sinais da #3,
 * 11 LONG com 1 WIN, 12 em ALTA_CORRECAO. No histórico live, #3 LONG em
 * ALTA_CORRECAO tem n=27, WR=33%, PF=0.41 (-19.3%) — o resto da #3 é
 * ~neutro. Isto valida (ou derruba) esse corte no histórico por par,
 * antes de qualquer mudança em produção.
 *
 * Pra cada par que roda a #3 ao vivo (1h), compara:
 *   - base: todos os trades da #3
 *   - sem LONG em ALTA_CORRECAO (o filtro proposto)
 *   - fatia removida (só LONG em ALTA_CORRECAO), pra ver se é realmente o ruim
 * e imprime o agregado dos pares. Só leitura — não grava nada.
 *
 *   npx tsx --require dotenv/config scripts/backtest-strat3-regime-direction.ts [meses=6]
 */
import { backtestRegimeFilteredStrategy, ContextTrade } from '../lib/radar-context-backtest';
import { computeMetrics } from '../lib/metrics';

const PAIRS = ['BNBUSDT', 'XRPUSDT', 'LTCUSDT', 'TRXUSDT', 'XLMUSDT', 'BCHUSDT'];
const TIMEFRAME = '1h';
const MONTHS = Number(process.argv[2] ?? 6);

const isBlocked = (t: ContextTrade) => t.direction === 'LONG' && t.regime === 'ALTA_CORRECAO';

function fmt(pair: string, trades: ContextTrade[]): string {
  const m = computeMetrics(trades.map((t) => ({ pair, timeframe: TIMEFRAME, status: t.status, pnlPercent: t.pnlPercent, createdAt: t.entryTime, closedAt: t.closedAt })));
  const sum = trades.reduce((a, t) => a + t.pnlPercent, 0);
  return `n=${String(m.totalTrades).padStart(3)} WR=${m.winRate.toFixed(0).padStart(3)}% PF=${m.profitFactor.toFixed(2)} soma=${sum.toFixed(1)}%`;
}

async function main() {
  console.log(`=== Trap de Liquidez (#3) — corte LONG em ALTA_CORRECAO | ${TIMEFRAME} | ${MONTHS} meses ===\n`);
  const pooled: ContextTrade[] = [];

  for (const pair of PAIRS) {
    try {
      const r = await backtestRegimeFilteredStrategy({ strategyId: 3, pair, timeframe: TIMEFRAME, months: MONTHS });
      const all = r.allTrades;
      const kept = all.filter((t) => !isBlocked(t));
      const removed = all.filter(isBlocked);
      pooled.push(...all.map((t) => ({ ...t, pair } as ContextTrade & { pair: string })));
      console.log(pair);
      console.log(`  base:      ${fmt(pair, all)}`);
      console.log(`  filtrado:  ${fmt(pair, kept)}`);
      console.log(`  removido:  ${fmt(pair, removed)}\n`);
    } catch (e: any) {
      console.log(`${pair} — ERRO: ${e?.message?.slice(0, 150)}\n`);
    }
  }

  console.log('=== AGREGADO (6 pares) ===');
  console.log(`  base:      ${fmt('ALL', pooled)}`);
  console.log(`  filtrado:  ${fmt('ALL', pooled.filter((t) => !isBlocked(t)))}`);
  console.log(`  removido:  ${fmt('ALL', pooled.filter(isBlocked))}`);

  console.log('\nPor regime × direção (agregado, base):');
  const groups = new Map<string, ContextTrade[]>();
  for (const t of pooled) {
    const k = `${t.regime ?? 'N/A'} ${t.direction}`;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).forEach(([k, v]) => console.log(`  ${k.padEnd(34)} ${fmt('ALL', v)}`));
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
