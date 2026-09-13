import type { ContinuousImprovementSummary } from './continuous-improvement';

export type MonitoringStatus = 'OK' | 'WARNING' | 'CRITICAL' | 'NOT_APPLICABLE';
export type MonitoringKind = 'daily' | 'update' | 'weekly' | 'monthly' | 'incident';

export interface MonitoringCheckResult {
  id: string;
  name: string;
  status: MonitoringStatus;
  evidence: unknown[];
  limitations: string[];
  suggestedManualActions: string[];
}

export interface MonitoringRunResult {
  kind: MonitoringKind;
  overallStatus: MonitoringStatus;
  generatedAt: string;
  timezone: 'America/Bahia';
  commitSha: string;
  codeVersion: string;
  strategyVersion: string;
  configVersion: string | number | null;
  period: { start: string; end: string };
  dataSources: string[];
  checks: MonitoringCheckResult[];
  notApplicable: MonitoringCheckResult[];
  baselineComparison?: unknown;
  improvement?: ContinuousImprovementSummary;
  limitations: string[];
  durationMs?: number;
}

export const MONITORING_TIMEZONE = 'America/Bahia' as const;
export const REPORT_ROOT = 'reports/monitoring';
