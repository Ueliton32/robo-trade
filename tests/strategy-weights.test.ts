import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStrategyWeights, WEIGHT_FLOOR, WEIGHT_CEILING, NEUTRAL_WEIGHT, RawStrategySample } from '../lib/strategy-weights';

function sample(overrides: Partial<RawStrategySample> = {}): RawStrategySample {
  return {
    strategyId: 1, strategyName: 'Estratégia Teste', sampleSize: 30, sufficientSample: true, expectancyNet: 0,
    ...overrides,
  };
}

test('normalizeStrategyWeights — menos de 2 estratégias com amostra suficiente, todas ficam neutras', () => {
  const raw = [
    sample({ strategyId: 1, sufficientSample: true, expectancyNet: 1.5 }),
    sample({ strategyId: 2, sufficientSample: false, expectancyNet: null, sampleSize: 3 }),
  ];
  const result = normalizeStrategyWeights(raw);
  assert.ok(result.every((r) => r.weight === NEUTRAL_WEIGHT));
  assert.ok(result.every((r) => r.neutral === true));
});

test('normalizeStrategyWeights — zero estratégias com amostra suficiente, todas neutras', () => {
  const raw = [
    sample({ strategyId: 1, sufficientSample: false, expectancyNet: null }),
    sample({ strategyId: 2, sufficientSample: false, expectancyNet: null }),
  ];
  const result = normalizeStrategyWeights(raw);
  assert.ok(result.every((r) => r.weight === NEUTRAL_WEIGHT && r.neutral));
});

test('normalizeStrategyWeights — com 2+ qualificadas, a pior fica no piso e a melhor no teto', () => {
  const raw = [
    sample({ strategyId: 1, expectancyNet: -1.0 }), // pior
    sample({ strategyId: 2, expectancyNet: 2.0 }),  // melhor
    sample({ strategyId: 3, expectancyNet: 0.5 }),  // meio do caminho
  ];
  const result = normalizeStrategyWeights(raw);
  const byId = new Map(result.map((r) => [r.strategyId, r]));

  assert.ok(Math.abs(byId.get(1)!.weight - WEIGHT_FLOOR) < 1e-9, 'pior expectância deve ficar exatamente no piso');
  assert.ok(Math.abs(byId.get(2)!.weight - WEIGHT_CEILING) < 1e-9, 'melhor expectância deve ficar exatamente no teto');
  assert.ok(byId.get(3)!.weight > WEIGHT_FLOOR && byId.get(3)!.weight < WEIGHT_CEILING, 'expectância intermediária fica entre piso e teto');
  assert.ok(result.every((r) => !r.neutral));
});

test('normalizeStrategyWeights — nenhum peso nunca fica abaixo do piso, mesmo com desempenho muito ruim', () => {
  const raw = [
    sample({ strategyId: 1, expectancyNet: -50 }),
    sample({ strategyId: 2, expectancyNet: 50 }),
  ];
  const result = normalizeStrategyWeights(raw);
  assert.ok(result.every((r) => r.weight >= WEIGHT_FLOOR), 'nunca deve vetar automaticamente uma estratégia (piso sempre respeitado)');
});

test('normalizeStrategyWeights — qualificadas empatadas (spread 0) ficam todas no teto, não no piso', () => {
  const raw = [
    sample({ strategyId: 1, expectancyNet: 1.0 }),
    sample({ strategyId: 2, expectancyNet: 1.0 }),
  ];
  const result = normalizeStrategyWeights(raw);
  assert.ok(result.every((r) => Math.abs(r.weight - WEIGHT_CEILING) < 1e-9));
});

test('normalizeStrategyWeights — estratégia sem amostra suficiente fica neutra mesmo com outras qualificadas', () => {
  const raw = [
    sample({ strategyId: 1, expectancyNet: -1.0 }),
    sample({ strategyId: 2, expectancyNet: 2.0 }),
    sample({ strategyId: 3, sufficientSample: false, expectancyNet: null, sampleSize: 5 }),
  ];
  const result = normalizeStrategyWeights(raw);
  const strat3 = result.find((r) => r.strategyId === 3)!;
  assert.equal(strat3.weight, NEUTRAL_WEIGHT);
  assert.equal(strat3.neutral, true);
});

test('normalizeStrategyWeights — preserva sampleSize e rawExpectancyNet pra auditoria', () => {
  const raw = [
    sample({ strategyId: 1, expectancyNet: -1.0, sampleSize: 42 }),
    sample({ strategyId: 2, expectancyNet: 2.0, sampleSize: 77 }),
  ];
  const result = normalizeStrategyWeights(raw);
  const strat1 = result.find((r) => r.strategyId === 1)!;
  assert.equal(strat1.sampleSize, 42);
  assert.equal(strat1.rawExpectancyNet, -1.0);
});
