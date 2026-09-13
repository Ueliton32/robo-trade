import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBacklog, transitionHypothesisStatus, renderImprovementBacklogMarkdown } from '../lib/monitoring/improvement-backlog';
import type { ImprovementBacklog, ImprovementHypothesis } from '../lib/monitoring/continuous-improvement';

function hypothesis(): ImprovementHypothesis {
  return {
    id: 'HYP-2026-0001',
    fingerprint: 'abc',
    createdAt: '2026-09-09T00:00:00.000Z',
    updatedAt: '2026-09-09T00:00:00.000Z',
    sourceReport: 'reports/monitoring/weekly/x.json',
    observedProblem: 'Problema observado',
    evidence: [{ value: 1 }],
    period: { start: '2026-09-01T00:00:00.000Z', end: '2026-09-08T00:00:00.000Z' },
    recurrence: 'ISOLATED',
    observations: 1,
    affectedAssets: ['BTCUSDT'],
    affectedTimeframes: ['1h'],
    affectedFactors: ['confidence'],
    affectedRegimes: ['ALTA'],
    problemType: 'STRATEGY_FRAGILITY',
    hypothesis: 'Hipótese testável',
    expectedMechanism: 'Mecanismo esperado',
    priority: 'MEDIUM',
    estimatedImpact: 'Médio',
    estimatedEffort: 'LOW',
    risks: ['overfitting'],
    overfittingRisk: 'MEDIUM',
    proposedExperiment: 'Experimento isolado',
    primaryMetrics: ['retorno líquido', 'expectativa por operação'],
    safetyMetrics: ['drawdown máximo'],
    approvalCriteria: ['supera baseline'],
    rejectionCriteria: ['deteriora segurança'],
    status: 'OBSERVED',
    finalDecision: null,
    testedInVersion: null,
    inSampleResult: null,
    outOfSampleResult: null,
    resultByRegime: null,
    conclusion: null,
  };
}

test('validateBacklog accepts required status contract', () => {
  const backlog: ImprovementBacklog = { version: 1, updatedAt: '2026-09-09T00:00:00.000Z', hypotheses: [hypothesis()] };
  assert.doesNotThrow(() => validateBacklog(backlog));
});

test('transitionHypothesisStatus blocks automatic approval and implementation states', () => {
  const h = hypothesis();
  assert.throws(() => transitionHypothesisStatus(h, 'APPROVED_FOR_EXPERIMENT', 'automatic'), /explicit user approval/i);
  assert.throws(() => transitionHypothesisStatus(h, 'IMPLEMENTED', 'automatic'), /explicit user approval/i);
  assert.equal(transitionHypothesisStatus(h, 'UNDER_REVIEW', 'automatic').status, 'UNDER_REVIEW');
});

test('renderImprovementBacklogMarkdown includes hypotheses and statuses', () => {
  const md = renderImprovementBacklogMarkdown({ version: 1, updatedAt: '2026-09-09T00:00:00.000Z', hypotheses: [hypothesis()] });
  assert.match(md, /HYP-2026-0001/);
  assert.match(md, /OBSERVED/);
});
