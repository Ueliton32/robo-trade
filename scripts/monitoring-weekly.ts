import { prisma } from '@/lib/prisma';
import { computeExtendedMetrics, signalRowToEvaluationTrade } from '@/lib/metrics-extended';
import { acquireFileRunLock } from '@/lib/monitoring/lock';
import { check, buildRun } from '@/lib/monitoring/runtime';
import { writeMonitoringReport } from '@/lib/monitoring/report-writer';
import { compareWithBaseline } from '@/lib/monitoring/baseline';
import { maybeNotifyCritical } from '@/lib/monitoring/incident';
import { deriveImprovementHypotheses, toReportImprovement } from '@/lib/monitoring/continuous-improvement';
import { loadImprovementBacklog, saveImprovementBacklog } from '@/lib/monitoring/improvement-backlog';

function countBy<T>(items: T[], key: (x: T) => string) { const m: Record<string, number> = {}; for (const x of items) m[key(x)] = (m[key(x)] ?? 0) + 1; return m; }
function avg(xs: number[]) { return xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0; }
function eligibilityCodes(indicators: unknown): string[] { const codes = (indicators as any)?.strategyEligibility?.reasonCodes; return Array.isArray(codes) ? codes : []; }

async function main() {
  const startedAt = Date.now();
  const lock = await acquireFileRunLock('monitoring-weekly', 180);
  if (!lock.acquired) { console.error(lock.reason); process.exit(2); }
  try {
    const now = Date.now(); const week = 7*24*3600_000;
    const current = await prisma.signal.findMany({ where: { createdAt: { gte: new Date(now-week) } }, orderBy: { createdAt: 'asc' } });
    const previous = await prisma.signal.findMany({ where: { createdAt: { gte: new Date(now-2*week), lt: new Date(now-week) } }, orderBy: { createdAt: 'asc' } });
    const closed = current.filter((s) => ['WIN','LOSS'].includes(s.status)).map(signalRowToEvaluationTrade);
    const metrics = computeExtendedMetrics(closed as any);
    const summary = {
      counts: { total: current.length, long: current.filter(s=>s.direction==='LONG').length, short: current.filter(s=>s.direction==='SHORT').length, neutral: current.filter(s=>!['LONG','SHORT'].includes(s.direction)).length },
      avgConfidence: avg(current.map(s=>s.confidence).filter((x): x is number => x !== null && Number.isFinite(x))),
      avgMlProbability: avg(current.map(s=>s.mlProbability).filter((x): x is number => x !== null && Number.isFinite(x))),
      coverage: { marketRegime: current.filter(s=>s.marketRegime != null).length, atrRatio: current.filter(s=>s.atrRatio != null).length, volumeRatio: current.filter(s=>s.volumeRatio != null).length },
      reasonCodes: countBy(current.flatMap(s=>eligibilityCodes(s.indicators)), String),
      byAsset: countBy(current, s=>s.pair), byTimeframe: countBy(current, s=>s.timeframe), byDirection: countBy(current, s=>s.direction),
      metrics,
      previousCount: previous.length,
    };
    const baseline = await compareWithBaseline('weekly-stability-summary', summary, true);
    const checks = [
      check('weekly-signal-distribution', 'Distribuição LONG/SHORT/neutro e scores', current.length ? 'OK' : 'WARNING', [summary.counts, { avgConfidence: summary.avgConfidence, avgMlProbability: summary.avgMlProbability }], ['Neutro não é direção operacional usual no Signal atual.']),
      check('weekly-eligibility-reason-codes', 'Frequência de gates/vetos/reason codes', Object.keys(summary.reasonCodes).length ? 'OK' : 'WARNING', [summary.reasonCodes], ['Histórico de Strategy Eligibility ainda é recente.']),
      check('weekly-performance', 'Métricas semanais por sinais fechados', closed.length >= 20 ? 'OK' : 'WARNING', [metrics], ['Amostra pequena quando abaixo de 20 sinais fechados.']),
      check('weekly-baseline', 'Semana atual vs baseline/média móvel', baseline.changed ? 'WARNING' : 'OK', [baseline], ['Baseline inicial é experimental.']),
    ];
    const run = buildRun({ kind: 'weekly', startedAt, strategyVersion: 'strategy-eligibility-v1/audit-only', configVersion: null, period: { start: new Date(now-week).toISOString(), end: new Date().toISOString() }, dataSources: ['Postgres/Prisma Signal'], checks, notApplicable: [], baselineComparison: baseline, limitations: ['Não reotimiza pesos/thresholds; apenas mede estabilidade.'] });
    const backlog = await loadImprovementBacklog();
    const improvement = deriveImprovementHypotheses(run, backlog.hypotheses, `weekly:${run.generatedAt}`);
    run.improvement = toReportImprovement(improvement);
    await saveImprovementBacklog({ ...backlog, hypotheses: improvement.backlog });
    const files = await writeMonitoringReport(run); const notify = await maybeNotifyCritical(run);
    console.log(JSON.stringify({ status: run.overallStatus, files, notify }, null, 2));
    process.exitCode = run.overallStatus === 'CRITICAL' ? 1 : 0;
  } finally { await lock.release(); await prisma.$disconnect(); }
}
main().catch((e)=>{ console.error(e?.message ?? e); process.exit(1); });
