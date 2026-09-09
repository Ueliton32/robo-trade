import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStrategyEligibility } from '../lib/strategy-eligibility';
import { STRATEGY_ELIGIBILITY_CONFIG_V1 } from '../lib/strategy-eligibility-config';
import type { StrategyEligibilityInput } from '../lib/strategy-eligibility';

function baseInput(overrides: Partial<StrategyEligibilityInput['signal']> = {}): StrategyEligibilityInput {
  return {
    signal: {
      strategyId: 3,
      strategyName: 'Trap de Liquidez',
      pair: 'TRXUSDT',
      timeframe: '1h',
      direction: 'LONG',
      confidence: 75,
      marketRegime: 'ALTA',
      regimeForce: 0.67,
      atrRatio: 1.0,
      volumeRatio: 1.0,
      spreadAtSignal: 0.03,
      mlProbability: 0.62,
      mlModelVersion: 1,
      weightAtSignal: 1,
      ...overrides,
    },
    context: { cycleCandidates: [] },
    config: STRATEGY_ELIGIBILITY_CONFIG_V1,
  };
}

test('returns eligible with PASS_ALL_CHECKS when all gates pass', () => {
  const result = evaluateStrategyEligibility(baseInput());
  assert.equal(result.decision, 'ELIGIBLE');
  assert.equal(result.eligible, true);
  assert.deepEqual(result.reasonCodes, ['PASS_ALL_CHECKS']);
  assert.equal(result.direction, 'LONG');
  assert.equal(result.audit.configVersion, STRATEGY_ELIGIBILITY_CONFIG_V1.version);
  assert.match(result.audit.configFingerprint, /^[a-f0-9]{64}$/);
});

test('evaluates SHORT separately and preserves direction in the decision', () => {
  const result = evaluateStrategyEligibility(baseInput({ direction: 'SHORT', marketRegime: 'BAIXA' }));
  assert.equal(result.direction, 'SHORT');
  assert.equal(result.decision, 'ELIGIBLE');
});

test('rejects low raw confidence with reason code', () => {
  const result = evaluateStrategyEligibility(baseInput({ confidence: 59 }));
  assert.equal(result.decision, 'INELIGIBLE');
  assert.ok(result.reasonCodes.includes('LOW_CONFIDENCE'));
});

test('rejects missing required coverage fields with reason codes', () => {
  const result = evaluateStrategyEligibility(baseInput({ marketRegime: null, atrRatio: null, volumeRatio: null }));
  assert.equal(result.decision, 'INELIGIBLE');
  assert.ok(result.reasonCodes.includes('MISSING_MARKET_REGIME'));
  assert.ok(result.reasonCodes.includes('MISSING_ATR_RATIO'));
  assert.ok(result.reasonCodes.includes('MISSING_VOLUME_RATIO'));
});

test('rejects opposite direction conflict on same pair and timeframe', () => {
  const input = baseInput();
  input.context.cycleCandidates = [{ strategyId: 1, pair: 'TRXUSDT', timeframe: '1h', direction: 'SHORT', confidence: 74 }];
  const result = evaluateStrategyEligibility(input);
  assert.equal(result.decision, 'INELIGIBLE');
  assert.ok(result.reasonCodes.includes('OPPOSITE_DIRECTION_CONFLICT'));
});

test('rejects volatility and liquidity breaches with explicit reason codes', () => {
  const result = evaluateStrategyEligibility(baseInput({ atrRatio: 2.8, volumeRatio: 0.1, spreadAtSignal: 0.5 }));
  assert.equal(result.decision, 'INELIGIBLE');
  assert.ok(result.reasonCodes.includes('ATR_RATIO_TOO_HIGH'));
  assert.ok(result.reasonCodes.includes('VOLUME_RATIO_TOO_LOW'));
  assert.ok(result.reasonCodes.includes('SPREAD_TOO_WIDE'));
});
