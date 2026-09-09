import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveImprovementHypotheses, NO_STATISTICALLY_SUPPORTED_HYPOTHESIS } from '../lib/monitoring/continuous-improvement';
import type { MonitoringRunResult } from '../lib/monitoring/contracts';

function run(overrides: Partial<MonitoringRunResult> = {}): MonitoringRunResult {
  return {
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
    ...overrides,
  };
}

test('does not invent hypotheses when evidence is insufficient', () => {
  const result = deriveImprovementHypotheses(run({ checks: [{ id: 'healthy', name: 'healthy', status: 'OK', evidence: [], limitations: [], suggestedManualActions: [] }] }), []);
  assert.equal(result.summary, NO_STATISTICALLY_SUPPORTED_HYPOTHESIS);
  assert.deepEqual(result.newHypotheses, []);
});

test('creates OBSERVED hypothesis from critical reproducible update failure', () => {
  const result = deriveImprovementHypotheses(run({
    kind: 'update',
    overallStatus: 'CRITICAL',
    checks: [{ id: 'update-npm-audit-audit-level-high', name: 'npm audit --audit-level=high', status: 'CRITICAL', evidence: [{ output: 'high severity vulnerability in nodemailer' }], limitations: [], suggestedManualActions: [] }],
  }), []);
  assert.equal(result.newHypotheses.length, 1);
  assert.equal(result.newHypotheses[0].status, 'OBSERVED');
  assert.equal(result.newHypotheses[0].problemType, 'SOFTWARE_REGRESSION');
  assert.match(result.newHypotheses[0].proposedExperiment, /branch isolada/i);
});

test('does not create strategy hypothesis from a first generic warning', () => {
  const result = deriveImprovementHypotheses(run({ checks: [{ id: 'weekly-performance', name: 'Métricas semanais', status: 'WARNING', evidence: [{ closed: 2 }], limitations: [], suggestedManualActions: [] }] }), []);
  assert.equal(result.newHypotheses.length, 0);
  assert.equal(result.summary, NO_STATISTICALLY_SUPPORTED_HYPOTHESIS);
});

test('does not create hypothesis from experimental baseline warning', () => {
  const result = deriveImprovementHypotheses(run({ checks: [{ id: 'weekly-baseline', name: 'Semana atual vs baseline', status: 'WARNING', evidence: [{ changed: true }], limitations: ['Baseline inicial é experimental.'], suggestedManualActions: [] }] }), []);
  assert.equal(result.newHypotheses.length, 0);
  assert.equal(result.summary, NO_STATISTICALLY_SUPPORTED_HYPOTHESIS);
});

test('deduplicates baseline warning hypotheses as recurring', () => {
  const first = deriveImprovementHypotheses(run({ checks: [{ id: 'weekly-baseline', name: 'Semana atual vs baseline', status: 'WARNING', evidence: [{ changed: true }], limitations: [], suggestedManualActions: [] }] }), []);
  const second = deriveImprovementHypotheses(run({ generatedAt: '2026-09-16T12:00:00.000Z', checks: [{ id: 'weekly-baseline', name: 'Semana atual vs baseline', status: 'WARNING', evidence: [{ changed: true }], limitations: [], suggestedManualActions: [] }] }), first.backlog);
  assert.equal(second.newHypotheses.length, 0);
  assert.equal(second.recurringHypotheses.length, 1);
  assert.equal(second.backlog.length, 1);
  assert.equal(second.backlog[0].recurrence, 'RECURRING');
});
