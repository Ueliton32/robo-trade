import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldNotifyIncident } from '../lib/monitoring/alert-dedupe';

test('shouldNotifyIncident suppresses duplicate fingerprints inside cooldown', () => {
  const now = new Date('2026-09-09T10:00:00Z');
  const first = shouldNotifyIncident([], 'abc', now, 60);
  assert.equal(first.shouldNotify, true);
  const second = shouldNotifyIncident(first.updated, 'abc', new Date('2026-09-09T10:30:00Z'), 60);
  assert.equal(second.shouldNotify, false);
  const third = shouldNotifyIncident(first.updated, 'abc', new Date('2026-09-09T11:01:00Z'), 60);
  assert.equal(third.shouldNotify, true);
});
