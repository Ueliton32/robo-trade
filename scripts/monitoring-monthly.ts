import { prisma } from '@/lib/prisma';
import { populationStabilityIndex, classifyExperimentalPsi } from '@/lib/monitoring/monthly-drift';
import { computeExtendedMetrics, signalRowToEvaluationTrade } from '@/lib/metrics-extended';
import { acquireFileRunLock } from '@/lib/monitoring/lock';
import { check, buildRun } from '@/lib/monitoring/runtime';
import { writeMonitoringReport } from '@/lib/monitoring/report-writer';
import { compareWithBaseline } from '@/lib/monitoring/baseline';
import { maybeNotifyCritical } from '@/lib/monitoring/incident';
import { deriveImprovementHypotheses, toReportImprovement } from '@/lib/monitoring/continuous-improvement';
import { loadImprovementBacklog, saveImprovementBacklog } from '@/lib/monitoring/improvement-backlog';

function nums(rows: any[], key: string): number[] { return rows.map(r => r[key]).filter((x) => typeof x === 'number' && Number.isFinite(x)); }
function by<T>(rows: T[], key: (x:T)=>string) { const m: Record<string, number> = {}; for (const r of rows) m[key(r)] = (m[key(r)] ?? 0)+1; return m; }

async function main() {
  const startedAt = Date.now();
  const lock = await acquireFileRunLock('monitoring-monthly', 240);
  if (!lock.acquired) { console.error(lock.reason); process.exit(2); }
  try {
    const now = Date.now(); const month = 30*24*3600_000;
    const current = await prisma.signal.findMany({ where: { createdAt: { gte: new Date(now-month) } }, orderBy: { createdAt: 'asc' } });
    const previous = await prisma.signal.findMany({ where: { createdAt: { gte: new Date(now-2*month), lt: new Date(now-month) } }, orderBy: { createdAt: 'asc' } });
    const drift = {
      confidencePsi: populationStabilityIndex(nums(previous, 'confidence'), nums(current, 'confidence')),
      mlProbabilityPsi: populationStabilityIndex(nums(previous, 'mlProbability'), nums(current, 'mlProbability')),
      atrRatioPsi: populationStabilityIndex(nums(previous, 'atrRatio'), nums(current, 'atrRatio')),
      volumeRatioPsi: populationStabilityIndex(nums(previous, 'volumeRatio'), nums(current, 'volumeRatio')),
      spreadPsi: populationStabilityIndex(nums(previous, 'spreadAtSignal'), nums(current, 'spreadAtSignal')),
    };
    const regime = by(current, s => s.marketRegime ?? 'UNKNOWN');
    const closed = current.filter(s=>['WIN','LOSS'].includes(s.status));
    const metrics = computeExtendedMetrics(closed.map(signalRowToEvaluationTrade) as any);
    const costs = { feesPercent: nums(closed, 'feesPercent'), slippagePercent: nums(closed, 'slippagePercent'), fundingCostPercent: nums(closed, 'fundingCostPercent'), pnlNetPercent: nums(closed, 'pnlNetPercent') };
    const summary = { drift, regime, metrics, costSamples: Object.fromEntries(Object.entries(costs).map(([k,v]) => [k, { count: v.length, avg: v.length ? v.reduce((a,b)=>a+b,0)/v.length : null }])) };
    const worst = Math.max(...Object.values(drift));
    const baseline = await compareWithBaseline('monthly-drift-summary', summary, true);
    const checks = [
      check('monthly-drift', 'Drift de variáveis/fatores/scores/confidence/coverage', classifyExperimentalPsi(worst), [drift], ['PSI usa thresholds experimentais: 0.10 warning, 0.25 critical; validar estatisticamente antes de decisão operacional.']),
      check('monthly-regimes', 'Desempenho e frequência por regimes reproduzidos sem look-ahead', current.length ? 'OK' : 'WARNING', [regime], ['Usa marketRegime persistido no momento do sinal.']),
      check('monthly-costs', 'Custos lidos do BacktestEngine/fechamento: fees/slippage/funding/turnover', closed.length ? 'OK' : 'WARNING', [summary.costSamples], ['Não recalcula fees/slippage; apenas lê campos persistidos.']),
      check('monthly-baseline', 'Mês atual versus baseline', baseline.changed ? 'WARNING' : 'OK', [baseline], ['Baseline inicial é experimental.']),
    ];
    const run = buildRun({ kind: 'monthly', startedAt, strategyVersion: 'strategy-eligibility-v1/audit-only', configVersion: null, period: { start: new Date(now-month).toISOString(), end: new Date().toISOString() }, dataSources: ['Postgres/Prisma Signal'], checks, notApplicable: [], baselineComparison: baseline, limitations: ['Não altera thresholds nem reotimiza pesos.'] });
    const backlog = await loadImprovementBacklog();
    const improvement = deriveImprovementHypotheses(run, backlog.hypotheses, `monthly:${run.generatedAt}`);
    run.improvement = toReportImprovement(improvement);
    await saveImprovementBacklog({ ...backlog, hypotheses: improvement.backlog });
    const files = await writeMonitoringReport(run); const notify = await maybeNotifyCritical(run);
    console.log(JSON.stringify({ status: run.overallStatus, files, notify }, null, 2));
    process.exitCode = run.overallStatus === 'CRITICAL' ? 1 : 0;
  } finally { await lock.release(); await prisma.$disconnect(); }
}
main().catch((e)=>{ console.error(e?.message ?? e); process.exit(1); });
