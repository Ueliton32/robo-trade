import { prisma } from '@/lib/prisma';
import { check, buildRun } from '@/lib/monitoring/runtime';
import { writeMonitoringReport } from '@/lib/monitoring/report-writer';
import { maybeNotifyCritical } from '@/lib/monitoring/incident';

async function main() {
  const startedAt = Date.now();
  const activeBreakers = await prisma.riskCircuitBreaker.findMany({ where: { tripped: true } }).catch(() => []);
  const checks = [check('incident-active-breakers', 'Circuit breakers ativos', activeBreakers.length ? 'CRITICAL' : 'OK', [activeBreakers.map((b:any)=>({ key:b.key, reason:b.reason, triggeredAt:b.triggeredAt }))], [], ['Investigar breaker manualmente; não resetar automaticamente.'])];
  const run = buildRun({ kind: 'incident', startedAt, strategyVersion: 'strategy-eligibility-v1/audit-only', configVersion: null, period: { start: new Date(startedAt).toISOString(), end: new Date().toISOString() }, dataSources: ['Postgres/Prisma'], checks, notApplicable: [], limitations: ['Resumo executivo determinístico; sem chamada de modelo por padrão.'] });
  const files = await writeMonitoringReport(run); const notify = await maybeNotifyCritical(run);
  console.log(JSON.stringify({ status: run.overallStatus, files, notify }, null, 2));
  process.exitCode = run.overallStatus === 'CRITICAL' ? 1 : 0;
}
main().finally(()=>prisma.$disconnect()).catch((e)=>{ console.error(e?.message ?? e); process.exit(1); });
