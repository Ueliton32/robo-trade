/**
 * Checagem do módulo lib/trend-paper.ts — falha (exit 1) se algo estiver errado.
 * Usa uma chave de teste no SystemState e apaga no fim; NÃO toca o livro-caixa
 * de verdade.
 *
 *   npx tsx --require dotenv/config scripts/trend-paper-check.ts
 */
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import {
  TREND_PAIRS, DailySeries, prepare, buildRecords, fetchDailySeries, updateTrendPaperIfDue, getTrendPaperStatus, utcDate,
} from '../lib/trend-paper';

const TEST_KEY = 'trend_paper_ledger_check_tmp';
const DAY = 86400_000;

async function main() {
  console.log('1) Baixando histórico diário...');
  const series = await fetchDailySeries();
  const prepared = prepare(series);
  const btcDates = series.get('BTCUSDT')!.dates;
  console.log(`   ${TREND_PAIRS.length} pares, BTC: ${btcDates[0]} → ${btcDates[btcDates.length - 1]} (${btcDates.length} dias)`);

  console.log('2) Sem look-ahead: o registro de uma data não muda se o futuro for cortado...');
  const full = buildRecords(null, btcDates[btcDates.length - 1], prepared, btcDates[btcDates.length - 300]);
  for (const k of [250, 120, 40, 5]) {
    const cut = btcDates[btcDates.length - 1 - k];
    const truncated = new Map([...series].map(([p, s]): [string, DailySeries] => {
      const n = s.dates.filter((d) => d <= cut).length;
      return [p, { dates: s.dates.slice(0, n), h: s.h.slice(0, n), l: s.l.slice(0, n), c: s.c.slice(0, n) }];
    }));
    const part = buildRecords(null, cut, prepare(truncated), btcDates[btcDates.length - 300]);
    const a = part[part.length - 1], b = full.find((r) => r.date === cut)!;
    assert.deepEqual(a.signals, b.signals, `sinais mudaram em ${cut}`);
    assert.deepEqual(a.weights, b.weights, `pesos mudaram em ${cut}`);
    assert.ok(Math.abs(a.equity - b.equity) < 1e-12, `capital mudou em ${cut}`);
  }

  console.log('3) Invariantes de peso (>=0, soma <= 100%, sem alavancagem)...');
  for (const r of full) {
    const w = Object.values(r.weights);
    assert.ok(w.every((x) => x >= 0), `peso negativo em ${r.date}`);
    assert.ok(w.reduce((a, b) => a + b, 0) <= 1 + 1e-9, `soma > 100% em ${r.date}`);
  }

  console.log('4) Livro-caixa no banco: criação, idempotência e recuperação de dias perdidos...');
  await prisma.systemState.deleteMany({ where: { key: TEST_KEY } });
  const now = Date.now();
  const first = await updateTrendPaperIfDue(now - 5 * DAY, TEST_KEY);
  assert.equal(first.added, 1, 'primeira execução deveria criar 1 registro');
  assert.equal((await updateTrendPaperIfDue(now - 5 * DAY, TEST_KEY)).added, 0, 'repetir no mesmo dia deveria ser no-op');
  const catchUp = await updateTrendPaperIfDue(now, TEST_KEY);
  assert.equal(catchUp.added, 5, `deveria recuperar 5 dias, recuperou ${catchUp.added}`);
  const ledger = JSON.parse((await prisma.systemState.findUnique({ where: { key: TEST_KEY } }))!.value);
  const dates: string[] = ledger.records.map((r: any) => r.date);
  assert.equal(dates.length, 6);
  for (let i = 1; i < dates.length; i++) assert.equal(dates[i], utcDate(Date.parse(dates[i - 1]) + DAY), 'datas não consecutivas');
  const replay = buildRecords(null, dates[5], prepared, dates[0]);
  assert.ok(Math.abs(replay[5].equity - ledger.records[5].equity) < 1e-12, 'recuperação difere do replay puro');
  const status = await getTrendPaperStatus(TEST_KEY);
  console.log('   status de amostra:', JSON.stringify({ ...status, curve: `${status?.curve.length} pontos`, positions: status?.positions.slice(0, 3) }));
  await prisma.systemState.deleteMany({ where: { key: TEST_KEY } });

  console.log('5) Replay de 2024-01-01 até hoje (pra comparar com o backtest de pesquisa: 2024→hoje total +43.3%, Sharpe 0.63, queda -34.2%)...');
  const rs = buildRecords(null, btcDates[btcDates.length - 1], prepared, '2024-01-01');
  const rets = rs.slice(1).map((r, i) => r.equity / rs[i].equity - 1);
  const m = rets.reduce((a, b) => a + b, 0) / rets.length, sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1));
  let peak = 1, mdd = 0; for (const r of rs) { peak = Math.max(peak, r.equity); mdd = Math.min(mdd, r.equity / peak - 1); }
  console.log(`   total ${((rs[rs.length - 1].equity / rs[0].equity - 1) * 100).toFixed(1)}% | Sharpe ${((m / sd) * Math.sqrt(365)).toFixed(2)} | queda máx ${(mdd * 100).toFixed(1)}%`);

  console.log('\nTudo OK.');
}

main().catch((e) => { console.error('\nFALHOU:', e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
