import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDelay, detectKlineIntegrityIssues } from '../lib/monitoring/data-quality';

const minute = 60_000;

function k(openTime: number, closeTime = openTime + minute - 1, overrides = {}) {
  return { openTime, closeTime, open: 10, high: 11, low: 9, close: 10, volume: 100, ...overrides };
}

test('classifyDelay returns OK/WARNING/CRITICAL from expected interval', () => {
  const now = 10 * minute;
  assert.equal(classifyDelay(now - 1 * minute, now, minute).status, 'OK');
  assert.equal(classifyDelay(now - 3 * minute, now, minute).status, 'WARNING');
  assert.equal(classifyDelay(now - 7 * minute, now, minute).status, 'CRITICAL');
});

test('detectKlineIntegrityIssues catches gaps duplicates and out-of-order timestamps', () => {
  const rows = [k(0), k(minute), k(minute), k(4 * minute), k(3 * minute)];
  const issues = detectKlineIntegrityIssues(rows, minute).map((i) => i.code);
  assert.ok(issues.includes('DUPLICATE_CANDLE'));
  assert.ok(issues.includes('MISSING_CANDLE'));
  assert.ok(issues.includes('OUT_OF_ORDER'));
});

test('detectKlineIntegrityIssues catches null infinite and invalid OHLCV values', () => {
  const rows = [
    k(0, minute - 1, { close: Number.POSITIVE_INFINITY }),
    k(minute, 2 * minute - 1, { high: 8 }),
    k(2 * minute, 3 * minute - 1, { volume: -1 }),
  ];
  const issues = detectKlineIntegrityIssues(rows, minute).map((i) => i.code);
  assert.ok(issues.includes('NON_FINITE_VALUE'));
  assert.ok(issues.includes('INVALID_PRICE_RANGE'));
  assert.ok(issues.includes('INVALID_VOLUME'));
});
