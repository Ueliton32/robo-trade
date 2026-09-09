import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStrategyEligibility } from '../lib/strategy-eligibility';
import { STRATEGY_ELIGIBILITY_CONFIG_V1 } from '../lib/strategy-eligibility-config';
import type { EnrichedSignalData } from '../lib/analysis-engine';

function enrichedSignal(direction: 'LONG' | 'SHORT'): EnrichedSignalData {
  return {
    strategyId: 3,
    strategyName: 'Trap de Liquidez',
    pair: 'BNBUSDT',
    timeframe: '1h',
    direction,
    mode: 'Swing Trade',
    entryPrice: 100,
    target1: direction === 'LONG' ? 103 : 97,
    target2: direction === 'LONG' ? 106 : 94,
    stopLoss: direction === 'LONG' ? 98 : 102,
    leverage: '5x-10x',
    confidence: 75,
    reason: 'fixture',
    riskRewardRatio: 1.5,
    marketRegime: direction === 'LONG' ? 'ALTA' : 'BAIXA',
    regimeForce: 0.67,
    atrRatio: 1.1,
    volumeRatio: 0.9,
    spreadAtSignal: 0.04,
    mlProbability: 0.61,
    mlModelVersion: 1,
    weightAtSignal: 1,
    executionMode: 'SHADOW',
  };
}

test('accepts existing EnrichedSignalData shape without DB or exchange access', () => {
  const signal = enrichedSignal('LONG');
  const result = evaluateStrategyEligibility({
    signal,
    context: { cycleCandidates: [] },
    config: STRATEGY_ELIGIBILITY_CONFIG_V1,
  });

  assert.equal(result.decision, 'ELIGIBLE');
  assert.equal(result.direction, 'LONG');
  assert.equal(signal.entryPrice, 100, 'eligibility must not mutate or recalculate entry');
  assert.equal(signal.stopLoss, 98, 'eligibility must not mutate or recalculate stop');
  assert.equal(signal.target1, 103, 'eligibility must not mutate or recalculate target');
});

test('detects LONG/SHORT conflict from same-cycle candidates using existing signal fields', () => {
  const signal = enrichedSignal('LONG');
  const result = evaluateStrategyEligibility({
    signal,
    context: {
      cycleCandidates: [
        { strategyId: 6, pair: 'BNBUSDT', timeframe: '1h', direction: 'SHORT', confidence: 74, mlProbability: null },
      ],
    },
    config: STRATEGY_ELIGIBILITY_CONFIG_V1,
  });

  assert.equal(result.decision, 'INELIGIBLE');
  assert.ok(result.reasonCodes.includes('OPPOSITE_DIRECTION_CONFLICT'));
});
