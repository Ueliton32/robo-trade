import test from 'node:test';
import assert from 'node:assert/strict';
import { createInMemoryRunLock } from '../lib/monitoring/lock';

test('run lock prevents overlapping executions for same routine', async () => {
  const lock = createInMemoryRunLock();
  const first = await lock.acquire('daily');
  assert.equal(first.acquired, true);
  const second = await lock.acquire('daily');
  assert.equal(second.acquired, false);
  await first.release();
  const third = await lock.acquire('daily');
  assert.equal(third.acquired, true);
});
