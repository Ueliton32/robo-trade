import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { getKlines, getBookTicker, getFundingRate } from '@/lib/binance';
import { getGlobalPairStrategyPlan } from '@/lib/pair-strategy-plan';
import { intervalMsForTimeframe, classifyDelay, detectKlineIntegrityIssues } from '@/lib/monitoring/data-quality';
import { acquireFileRunLock } from '@/lib/monitoring/lock';
import { check, buildRun } from '@/lib/monitoring/runtime';
import { writeMonitoringReport } from '@/lib/monitoring/report-writer';
import { maybeNotifyCritical } from '@/lib/monitoring/incident';

async function dirBytes(dir: string): Promise<number> { let total = 0; try { for (const e of await fs.readdir(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); total += e.isDirectory() ? await dirBytes(p) : (await fs.stat(p)).size; } } catch {} return total; }

async function main() {
  const startedAt = Date.now();
  const lock = await acquireFileRunLock('monitoring-daily', 120);
  if (!lock.acquired) { console.error(lock.reason); process.exit(2); }
  const checks = [];
  const na = [check('source-divergence', 'Divergência entre fontes', 'NOT_APPLICABLE', [], ['Apenas Binance Futures está configurada como fonte primária.'])];
  try {
    const plan = await getGlobalPairStrategyPlan();
    const combos = Object.entries(plan).flatMap(([pair, strategies]) => Array.from(new Set(Object.values(strategies).flat())).map((tf) => ({ pair, tf })));
    const unique = Array.from(new Map(combos.map((c) => [`${c.pair}|${c.tf}`, c])).values()).slice(0, Number(process.env.MONITORING_DAILY_MAX_COMBOS ?? 60));
    let critical = 0, warning = 0;
    const evidence: unknown[] = [];
    for (const { pair, tf } of unique) {
      const expected = intervalMsForTimeframe(tf);
      const rows = await getKlines(pair, tf, 120);
      if (!rows.length) { critical++; evidence.push({ pair, tf, issue: 'NO_CANDLES' }); continue; }
      const delay = classifyDelay(rows[rows.length - 1].closeTime, Date.now(), expected);
      const issues = detectKlineIntegrityIssues(rows, expected);
      if (delay.status === 'CRITICAL' || issues.some((i) => ['NON_FINITE_VALUE','NULL_VALUE','INVALID_PRICE_RANGE','INVALID_VOLUME','OUT_OF_ORDER'].includes(i.code))) critical++;
      else if (delay.status === 'WARNING' || issues.length) warning++;
      if (delay.status !== 'OK' || issues.length) evidence.push({ pair, tf, delay, issues: issues.slice(0, 5) });
    }
    checks.push(check('market-data-quality', 'Qualidade e atraso dos candles por ativo/timeframe', critical ? 'CRITICAL' : warning ? 'WARNING' : 'OK', evidence, ['Gaps anormais usam limite experimental de 8% candle-a-candle.'], ['Verificar conectividade com Binance e logs do scheduler; não corrigir dados automaticamente.']));

    const probes = await Promise.allSettled([getBookTicker('BTCUSDT'), getFundingRate('BTCUSDT')]);
    checks.push(check('source-availability', 'Disponibilidade das fontes Binance', probes.every((p) => p.status === 'fulfilled' && p.value) ? 'OK' : 'WARNING', probes.map((p) => p.status)));
    const dbCounts = { signals: await prisma.signal.count(), configVersions: await prisma.configVersion.count(), models: await prisma.mLModel.count() };
    checks.push(check('database-integrity', 'Integridade básica do banco', dbCounts.signals >= 0 ? 'OK' : 'CRITICAL', [dbCounts]));
    const reportsBytes = await dirBytes(path.join(process.cwd(), 'reports'));
    checks.push(check('storage-growth', 'Crescimento local de relatórios/logs', reportsBytes > 500_000_000 ? 'WARNING' : 'OK', [{ reportsBytes }]));

    const run = buildRun({ kind: 'daily', startedAt, strategyVersion: 'strategy-eligibility-v1/audit-only', configVersion: null, period: { start: new Date(Date.now() - 24*3600_000).toISOString(), end: new Date().toISOString() }, dataSources: ['Binance Futures', 'Postgres/Prisma'], checks, notApplicable: na, limitations: [] });
    const files = await writeMonitoringReport(run);
    const notify = await maybeNotifyCritical(run);
    console.log(JSON.stringify({ status: run.overallStatus, files, notify }, null, 2));
    process.exitCode = run.overallStatus === 'CRITICAL' ? 1 : 0;
  } finally { await lock.release(); await prisma.$disconnect(); }
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
