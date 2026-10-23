import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreSignalWithActiveModel } from '../lib/ml-model';
import { FEATURE_NAMES } from '../lib/ml-features';
import type { FeatureInput } from '../lib/ml-features';

const FEATURE_COUNT = FEATURE_NAMES.length;

function baseInput(overrides: Partial<FeatureInput> = {}): FeatureInput {
  return {
    direction: 'LONG',
    entryPrice: 100,
    target1: 103,
    stopLoss: 98,
    confidence: 75,
    marketRegime: 'ALTA',
    regimeForce: 0.67,
    atrRatio: 1.1,
    volumeRatio: 1.0,
    ...overrides,
  };
}

function neutralModel(overrides: Partial<{ weights: number[]; bias: number }> = {}) {
  return {
    version: 3,
    featureNames: [...FEATURE_NAMES],
    weights: overrides.weights ?? Array(FEATURE_COUNT).fill(0),
    bias: overrides.bias ?? 0,
    featureMeans: Array(FEATURE_COUNT).fill(0),
    featureStds: Array(FEATURE_COUNT).fill(1),
  };
}

test('scoreSignalWithActiveModel — sem modelo ativo pra estratégia, devolve null (nunca inventa pontuação)', () => {
  const activeModels = new Map(); // nenhum modelo
  const result = scoreSignalWithActiveModel(activeModels, 1, baseInput());
  assert.equal(result, null);
});

test('scoreSignalWithActiveModel — sem contexto de regime, devolve null mesmo com modelo ativo', () => {
  const activeModels = new Map([[1, neutralModel()]]);
  const result = scoreSignalWithActiveModel(activeModels, 1, baseInput({ marketRegime: null }));
  assert.equal(result, null, 'falta de regime não pode virar valor inventado');
});

test('scoreSignalWithActiveModel — pesos e bias zerados produzem probabilidade neutra (0.5)', () => {
  const activeModels = new Map([[1, neutralModel()]]);
  const result = scoreSignalWithActiveModel(activeModels, 1, baseInput());
  assert.ok(result);
  assert.ok(Math.abs(result!.probability - 0.5) < 1e-9);
  assert.equal(result!.modelVersion, 3);
});

test('scoreSignalWithActiveModel — bias fortemente positivo empurra a probabilidade perto de 1', () => {
  const activeModels = new Map([[1, neutralModel({ bias: 10 })]]);
  const result = scoreSignalWithActiveModel(activeModels, 1, baseInput());
  assert.ok(result!.probability > 0.99);
});

test('scoreSignalWithActiveModel — bias fortemente negativo empurra a probabilidade perto de 0', () => {
  const activeModels = new Map([[1, neutralModel({ bias: -10 })]]);
  const result = scoreSignalWithActiveModel(activeModels, 1, baseInput());
  assert.ok(result!.probability < 0.01);
});

test('scoreSignalWithActiveModel — pontua só a estratégia certa quando há modelos de várias estratégias', () => {
  const activeModels = new Map([
    [1, neutralModel({ bias: 10 })],
    [2, neutralModel({ bias: -10 })],
  ]);
  const resultStrat1 = scoreSignalWithActiveModel(activeModels, 1, baseInput());
  const resultStrat2 = scoreSignalWithActiveModel(activeModels, 2, baseInput());
  const resultStrat3 = scoreSignalWithActiveModel(activeModels, 3, baseInput());

  assert.ok(resultStrat1!.probability > 0.5);
  assert.ok(resultStrat2!.probability < 0.5);
  assert.equal(resultStrat3, null, 'estratégia sem modelo ativo não deve ser pontuada');
});

test('scoreSignalWithActiveModel — probabilidade sempre entre 0 e 1 (sigmoid nunca extrapola)', () => {
  const activeModels = new Map([[1, neutralModel({ weights: Array(FEATURE_COUNT).fill(5), bias: 3 })]]);
  const result = scoreSignalWithActiveModel(activeModels, 1, baseInput({ atrRatio: 50, volumeRatio: 0.01 }));
  assert.ok(result!.probability >= 0 && result!.probability <= 1);
});
