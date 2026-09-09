import test from 'node:test';
import assert from 'node:assert/strict';
import { combineStatuses } from '../lib/monitoring/status';

test('combineStatuses preserves severity ordering', () => {
  assert.equal(combineStatuses(['OK', 'NOT_APPLICABLE']), 'OK');
  assert.equal(combineStatuses(['OK', 'WARNING']), 'WARNING');
  assert.equal(combineStatuses(['OK', 'CRITICAL', 'WARNING']), 'CRITICAL');
  assert.equal(combineStatuses(['NOT_APPLICABLE']), 'NOT_APPLICABLE');
});
