/**
 * Exporta a curva de capital da tendência diária (lib/trend-paper.ts) pra CSV,
 * pra alimentar ferramentas de análise externas (ex: scripts/trend-tearsheet.py,
 * que usa o quantstats). Só leitura; não grava no banco.
 *
 * Gera dois arquivos em <dir> (padrão ./tmp-trend):
 *   trend_live.csv    — o livro-caixa de verdade (teste à frente desde 05/10/2026):
 *                       date,equity,btc_close
 *   trend_replay.csv  — a MESMA regra recalculada sobre o histórico desde
 *                       2023-01-01 (backtest, não é teste à frente; vale o aviso
 *                       de viés de sobrevivência de lib/trend-paper.ts): date,equity,btc_close
 *
 *   npx tsx --require dotenv/config scripts/export-trend-returns.ts [dir]
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';
import { TREND_PAPER_STATE_KEY, TrendLedger, fetchDailySeries, prepare, buildRecords } from '../lib/trend-paper';

const REPLAY_FROM = '2023-01-01';

async function main() {
  const dir = process.argv[2] ?? 'tmp-trend';
  fs.mkdirSync(dir, { recursive: true });
  const csv = (rows: { date: string; equity: number; btcClose: number }[]) => 'date,equity,btc_close\n' + rows.map((r) => `${r.date},${r.equity},${r.btcClose}`).join('\n') + '\n';

  const row = await prisma.systemState.findUnique({ where: { key: TREND_PAPER_STATE_KEY } });
  if (row) {
    const ledger = JSON.parse(row.value) as TrendLedger;
    fs.writeFileSync(path.join(dir, 'trend_live.csv'), csv(ledger.records));
    console.log(`trend_live.csv: ${ledger.records.length} dias (${ledger.records[0].date} → ${ledger.records[ledger.records.length - 1].date})`);
  } else {
    console.log('Livro-caixa ainda não existe — pulando trend_live.csv.');
  }

  const prepared = prepare(await fetchDailySeries());
  const btcDates = prepared.get('BTCUSDT')!.s.dates;
  const replay = buildRecords(null, btcDates[btcDates.length - 1], prepared, REPLAY_FROM);
  fs.writeFileSync(path.join(dir, 'trend_replay.csv'), csv(replay));
  console.log(`trend_replay.csv: ${replay.length} dias (${replay[0].date} → ${replay[replay.length - 1].date})`);
}

main().catch((e) => { console.error('Erro:', e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
