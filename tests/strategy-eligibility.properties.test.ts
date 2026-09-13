import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStrategyEligibility } from '../lib/strategy-eligibility';
import { fingerprintStrategyEligibilityConfig } from '../lib/strategy-eligibility-config';
import { STRATEGY_ELIGIBILITY_CONFIG_V1 } from '../lib/strategy-eligibility-config';
import type { StrategyEligibilityInput } from '../lib/strategy-eligibility';

function input(confidence: number, atrRatio: number, spreadAtSignal: number): StrategyEligibilityInput {
  return {
    signal: {
      strategyId: 1,
      strategyName: 'Rompimento de Range',
      pair: 'BTCUSDT',
      timeframe: '1h',
      direction: 'LONG',
      confidence,
      marketRegime: 'ALTA',
      regimeForce: 1,
      atrRatio,
      volumeRatio: 1,
      spreadAtSignal,
      mlProbability: null,
      mlModelVersion: null,
      weightAtSignal: 1,
    },
    context: { cycleCandidates: [] },
    config: STRATEGY_ELIGIBILITY_CONFIG_V1,
  };
}

test('same input and same config produce deterministic decision and fingerprint', () => {
  const first = evaluateStrategyEligibility(input(75, 1.0, 0.03));
  const second = evaluateStrategyEligibility(input(75, 1.0, 0.03));
  assert.deepEqual(
    { ...first, audit: { ...first.audit, evaluatedAt: '<ignored>' } },
    { ...second, audit: { ...second.audit, evaluatedAt: '<ignored>' } }
  );
});

test('config fingerprint changes when any threshold changes', () => {
  const base = fingerprintStrategyEligibilityConfig(STRATEGY_ELIGIBILITY_CONFIG_V1);
  const changed = fingerprintStrategyEligibilityConfig({
    ...STRATEGY_ELIGIBILITY_CONFIG_V1,
    confidence: { ...STRATEGY_ELIGIBILITY_CONFIG_V1.confidence, minRawConfidence: STRATEGY_ELIGIBILITY_CONFIG_V1.confidence.minRawConfidence + 1 },
  });
  assert.notEqual(base, changed);
});

test('raising confidence does not make an otherwise identical eligible signal ineligible', () => {
  for (let confidence = STRATEGY_ELIGIBILITY_CONFIG_V1.confidence.minRawConfidence; confidence <= 100; confidence += 5) {
    assert.equal(evaluateStrategyEligibility(input(confidence, 1.0, 0.03)).decision, 'ELIGIBLE');
  }
});

test('raising spread beyond max cannot improve liquidity result', () => {
  const ok = evaluateStrategyEligibility(input(75, 1.0, STRATEGY_ELIGIBILITY_CONFIG_V1.liquidity.maxSpreadPercent));
  const bad = evaluateStrategyEligibility(input(75, 1.0, STRATEGY_ELIGIBILITY_CONFIG_V1.liquidity.maxSpreadPercent + 0.01));
  assert.equal(ok.audit.checks.liquidity, true);
  assert.equal(bad.audit.checks.liquidity, false);
  assert.ok(bad.reasonCodes.includes('SPREAD_TOO_WIDE'));
});

test('raising atrRatio above max cannot remain eligible', () => {
  const bad = evaluateStrategyEligibility(input(75, STRATEGY_ELIGIBILITY_CONFIG_V1.volatility.maxAtrRatio + 0.01, 0.03));
  assert.equal(bad.decision, 'INELIGIBLE');
  assert.ok(bad.reasonCodes.includes('ATR_RATIO_TOO_HIGH'));
});
