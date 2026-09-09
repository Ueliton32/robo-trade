import type { MonitoringStatus } from './contracts';

const rank: Record<MonitoringStatus, number> = { NOT_APPLICABLE: 0, OK: 1, WARNING: 2, CRITICAL: 3 };

export function combineStatuses(statuses: MonitoringStatus[]): MonitoringStatus {
  if (!statuses.length) return 'NOT_APPLICABLE';
  const applicable = statuses.filter((s) => s !== 'NOT_APPLICABLE');
  if (!applicable.length) return 'NOT_APPLICABLE';
  return applicable.reduce((worst, cur) => (rank[cur] > rank[worst] ? cur : worst), 'OK' as MonitoringStatus);
}

export function statusFromCriticalWarning(critical: boolean, warning: boolean): MonitoringStatus {
  if (critical) return 'CRITICAL';
  if (warning) return 'WARNING';
  return 'OK';
}
