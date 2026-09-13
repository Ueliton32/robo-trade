import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdownReport } from '../lib/monitoring/report-writer';
import { NO_STATISTICALLY_SUPPORTED_HYPOTHESIS } from '../lib/monitoring/continuous-improvement';
import type { MonitoringRunResult } from '../lib/monitoring/contracts';

const run: MonitoringRunResult = {
  kind: 'weekly',
  overallStatus: 'OK',
  timezone: 'America/Bahia',
  generatedAt: '2026-09-09T12:00:00.000Z',
  commitSha: 'abc123',
  codeVersion: 'abc123',
  strategyVersion: 'strategy-eligibility-v1/audit-only',
  configVersion: null,
  period: { start: '2026-09-02T00:00:00.000Z', end: '2026-09-09T00:00:00.000Z' },
  dataSources: ['test'],
  checks: [],
  notApplicable: [],
  limitations: [],
};

test('weekly/monthly reports include continuous improvement section', () => {
  const md = renderMarkdownReport({ ...run, improvement: { summary: NO_STATISTICALLY_SUPPORTED_HYPOTHESIS, newHypotheses: [], recurringHypotheses: [], awaitingApproval: [], inExperiment: [], rejected: [], implementedMonitoring: [], prioritizedRecommendations: [] } });
  assert.match(md, /Hipóteses de melhoria contínua/);
  assert.match(md, new RegExp(NO_STATISTICALLY_SUPPORTED_HYPOTHESIS));
});
