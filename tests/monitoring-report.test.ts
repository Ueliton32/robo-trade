import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdownReport } from '../lib/monitoring/report-writer';

test('renderMarkdownReport includes required metadata and redacts secrets', () => {
  const md = renderMarkdownReport({
    kind: 'daily',
    overallStatus: 'CRITICAL',
    generatedAt: '2026-09-09T10:00:00-03:00',
    timezone: 'America/Bahia',
    commitSha: 'abc123',
    codeVersion: 'dev',
    strategyVersion: 'v8',
    configVersion: 8,
    period: { start: 'a', end: 'b' },
    dataSources: ['Binance Futures'],
    checks: [{ id: 'x', name: 'secret check', status: 'CRITICAL', evidence: ['token=abc'], limitations: [], suggestedManualActions: ['manual'] }],
    notApplicable: [],
    limitations: [],
  });
  assert.ok(md.includes('America/Bahia'));
  assert.ok(md.includes('abc123'));
  assert.equal(md.includes('token=abc'), false);
  assert.ok(md.includes('[REDACTED]'));
});
