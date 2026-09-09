import { execFileSync } from 'node:child_process';
import { acquireFileRunLock } from '@/lib/monitoring/lock';
import { check, buildRun } from '@/lib/monitoring/runtime';
import { writeMonitoringReport } from '@/lib/monitoring/report-writer';
import { compareWithBaseline } from '@/lib/monitoring/baseline';
import { maybeNotifyCritical } from '@/lib/monitoring/incident';

function run(command: string) {
  const started = Date.now();
  try {
    const output = execFileSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: true });
    return { ok: true, durationMs: Date.now() - started, output: output.slice(-4000) };
  } catch (e: any) {
    return {
      ok: false,
      durationMs: Date.now() - started,
      output: String((e.stdout ?? '') + (e.stderr ?? '') + (e.message ?? '')).slice(-4000),
    };
  }
}

async function main() {
  const startedAt = Date.now();
  const lock = await acquireFileRunLock('monitoring-update', 120);
  if (!lock.acquired) { console.error(lock.reason); process.exit(2); }
  try {
    const steps = [
      'npm run test',
      'npx tsc --noEmit',
      'npm run lint',
      'npx prisma validate',
      'npm audit --audit-level=high',
      'npm run build',
    ];
    const results = steps.map((command) => ({ command, ...run(command) }));
    const checks = results.map((r) => check(`update-${r.command.replace(/\W+/g, '-')}`, r.command, r.ok ? 'OK' : 'CRITICAL', [{ durationMs: r.durationMs, output: r.output }], [], ['Corrigir manualmente a etapa indicada; não fazer merge/deploy.']));
    const baseline = await compareWithBaseline('update-validation-commands-v2', results.map((r) => ({ command: r.command, ok: r.ok })), true);
    if (baseline.changed) checks.push(check('baseline-regression', 'Comparação com baseline versionado', 'WARNING', [baseline], ['Baseline inicial/experimental.']));
    const runResult = buildRun({ kind: 'update', startedAt, strategyVersion: 'strategy-eligibility-v1/audit-only', configVersion: null, period: { start: new Date(startedAt).toISOString(), end: new Date().toISOString() }, dataSources: ['local repo', 'npm audit'], checks, notApplicable: [], baselineComparison: baseline, limitations: ['Backtests pesados não rodam nesta rotina rápida para evitar consumo excessivo/rede.'] });
    const files = await writeMonitoringReport(runResult);
    const notify = await maybeNotifyCritical(runResult);
    console.log(JSON.stringify({ status: runResult.overallStatus, files, notify }, null, 2));
    process.exitCode = runResult.overallStatus === 'CRITICAL' ? 1 : 0;
  } finally { await lock.release(); }
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
