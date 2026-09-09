import { execFileSync } from 'node:child_process';
import { MonitoringRunResult, MonitoringCheckResult, MONITORING_TIMEZONE } from './contracts';
import { combineStatuses } from './status';

export function bahiaNow(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: MONITORING_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()).replace(' ', 'T') + '-03:00';
}

export function gitSha(): string {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { return 'unknown'; }
}

export function robotVersion(): string {
  try { return execFileSync('node', ['-e', "console.log(require('./package.json').version || 'dev')"], { encoding: 'utf8' }).trim(); } catch { return 'dev'; }
}

export function buildRun(params: Omit<MonitoringRunResult, 'overallStatus' | 'timezone' | 'generatedAt' | 'commitSha' | 'codeVersion'> & { startedAt: number }): MonitoringRunResult {
  const checks = params.checks;
  const notApplicable = params.notApplicable;
  return {
    ...params,
    overallStatus: combineStatuses(checks.map((c) => c.status)),
    timezone: MONITORING_TIMEZONE,
    generatedAt: bahiaNow(),
    commitSha: gitSha(),
    codeVersion: robotVersion(),
    durationMs: Date.now() - params.startedAt,
  };
}

export function check(id: string, name: string, status: MonitoringCheckResult['status'], evidence: unknown[] = [], limitations: string[] = [], suggestedManualActions: string[] = []): MonitoringCheckResult {
  return { id, name, status, evidence, limitations, suggestedManualActions };
}
