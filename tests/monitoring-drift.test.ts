import test from 'node:test';
import assert from 'node:assert/strict';
import { populationStabilityIndex } from '../lib/monitoring/monthly-drift';

test('populationStabilityIndex is zero for identical distributions', () => {
  assert.equal(populationStabilityIndex([1, 2, 3, 4], [1, 2, 3, 4]), 0);
});

test('populationStabilityIndex increases when distributions move apart', () => {
  const small = populationStabilityIndex([1, 2, 3, 4], [1, 2, 3, 5]);
  const large = populationStabilityIndex([1, 2, 3, 4], [10, 11, 12, 13]);
  assert.ok(large > small);
});
