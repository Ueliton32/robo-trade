import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampLeverageString,
  countActiveLossStreakInBatch,
  allocateComboCapacity,
  LossStreakRow,
} from '../lib/circuit-breakers';
import type { PairStrategyPlan } from '../lib/pair-strategy-plan';

// ───────────────────────────────────────────────────────────────────────
// clampLeverageString — teto absoluto de alavancagem, só pode reduzir
// ───────────────────────────────────────────────────────────────────────

test('clampLeverageString — reduz o teto quando ultrapassa o cap, mantendo a proporção mínima', () => {
  assert.equal(clampLeverageString('5x-20x', 10), '5x-10x');
});

test('clampLeverageString — não mexe quando já está dentro do cap', () => {
  assert.equal(clampLeverageString('3x-5x', 10), '3x-5x');
});

test('clampLeverageString — nunca aumenta, mesmo se o cap for maior que o máximo sugerido', () => {
  assert.equal(clampLeverageString('3x-5x', 50), '3x-5x');
});

test('clampLeverageString — também reduz o mínimo se ele ultrapassar o cap já reduzido', () => {
  assert.equal(clampLeverageString('15x-20x', 10), '10x-10x');
});

test('clampLeverageString — formato inesperado devolve sem mexer (não trava geração de sinal)', () => {
  assert.equal(clampLeverageString('alavancagem alta', 10), 'alavancagem alta');
  assert.equal(clampLeverageString('', 10), '');
});

// ───────────────────────────────────────────────────────────────────────
// countActiveLossStreakInBatch — já causou 3 incidentes reais documentados
// no código (loss_streak travado por histórico de combinação já desativada)
// ───────────────────────────────────────────────────────────────────────

function emptyPlan(): PairStrategyPlan {
  return {};
}

function planWith(pair: string, strategyId: number, timeframes: string[] = ['1h']): PairStrategyPlan {
  return { [pair]: { [strategyId]: timeframes } };
}

function row(overrides: Partial<LossStreakRow> = {}): LossStreakRow {
  return { status: 'LOSS', pair: 'BTCUSDT', strategyId: 1, direction: 'LONG', ...overrides };
}

test('countActiveLossStreakInBatch — conta perdas seguidas de uma combinação ativa', () => {
  const plan = planWith('BTCUSDT', 1);
  const batch = [row(), row(), row()];
  const result = countActiveLossStreakInBatch(batch, plan);
  assert.equal(result.streak, 3);
  assert.equal(result.ended, false);
});

test('countActiveLossStreakInBatch — para na primeira vitória de combinação ativa', () => {
  const plan = planWith('BTCUSDT', 1);
  const batch = [row(), row(), row({ status: 'WIN' }), row()];
  const result = countActiveLossStreakInBatch(batch, plan);
  assert.equal(result.streak, 2, 'não deve contar nada depois da vitória');
  assert.equal(result.ended, true);
});

test('countActiveLossStreakInBatch — ignora perdas de combinação já desativada (não conta nem interrompe)', () => {
  // Cenário real documentado: histórico de um par/estratégia removido da
  // config ativa não deveria nem alimentar nem travar a sequência.
  const plan = planWith('BTCUSDT', 1); // só BTCUSDT/estrat 1 está ativo
  const batch = [
    row(), // BTCUSDT/1 — ativo, conta
    row({ pair: 'HYPEUSDT', strategyId: 6 }), // combinação já desativada — ignorado
    row({ pair: 'HYPEUSDT', strategyId: 6, status: 'WIN' }), // vitória de combinação inativa — também ignorada, não "quebra" a sequência
    row(), // BTCUSDT/1 — ativo, conta
  ];
  const result = countActiveLossStreakInBatch(batch, plan);
  assert.equal(result.streak, 2, 'só as 2 perdas da combinação ativa devem contar');
  assert.equal(result.ended, false, 'a vitória da combinação inativa não deveria encerrar a sequência');
});

test('countActiveLossStreakInBatch — direção bloqueada não conta (ex: SHORT da estratégia 1)', () => {
  const plan = planWith('BTCUSDT', 1);
  const planWithBlockedShort: PairStrategyPlan = plan;
  // isComboActive(plan, pair, strategyId, direction) já checa
  // DIRECTION_BLOCKED_STRATEGIES_LIVE internamente — SHORT da estratégia 1
  // está bloqueado globalmente no módulo real (lib/pair-strategy-plan.ts).
  const batch = [row({ direction: 'SHORT' }), row({ direction: 'SHORT' }), row()];
  const result = countActiveLossStreakInBatch(batch, planWithBlockedShort);
  assert.equal(result.streak, 1, 'só a perda LONG (direção não bloqueada) deve contar');
});

test('countActiveLossStreakInBatch — lote vazio não quebra nem conta nada', () => {
  const result = countActiveLossStreakInBatch([], emptyPlan());
  assert.equal(result.streak, 0);
  assert.equal(result.ended, false);
});

// ───────────────────────────────────────────────────────────────────────
// allocateComboCapacity — limite de exposição por par, com priorização
// por peso quando fornecido
// ───────────────────────────────────────────────────────────────────────

interface Combo { pair: string; strategyId: number; }

test('allocateComboCapacity — libera tudo quando não há sinal pendente e cabe no teto', () => {
  const combos: Combo[] = [{ pair: 'BTCUSDT', strategyId: 1 }, { pair: 'ETHUSDT', strategyId: 2 }];
  const result = allocateComboCapacity(combos, new Map(), 3);
  assert.deepEqual(result.allowed, combos);
  assert.deepEqual(result.blockedPairs, []);
});

test('allocateComboCapacity — bloqueia um par que já está no teto, mas libera os outros', () => {
  const combos: Combo[] = [
    { pair: 'BTCUSDT', strategyId: 1 },
    { pair: 'ETHUSDT', strategyId: 2 },
  ];
  const pending = new Map([['BTCUSDT', 3]]); // já no teto de 3
  const result = allocateComboCapacity(combos, pending, 3);
  assert.deepEqual(result.allowed, [{ pair: 'ETHUSDT', strategyId: 2 }]);
  assert.deepEqual(result.blockedPairs, ['BTCUSDT']);
});

test('allocateComboCapacity — sem peso, mantém a ordem original até o teto', () => {
  const combos: Combo[] = [
    { pair: 'BTCUSDT', strategyId: 1 },
    { pair: 'BTCUSDT', strategyId: 2 },
    { pair: 'BTCUSDT', strategyId: 3 },
  ];
  const result = allocateComboCapacity(combos, new Map(), 2);
  assert.deepEqual(result.allowed, [{ pair: 'BTCUSDT', strategyId: 1 }, { pair: 'BTCUSDT', strategyId: 2 }]);
  assert.deepEqual(result.blockedPairs, ['BTCUSDT']);
});

test('allocateComboCapacity — com peso, prioriza estratégia de maior peso pelas vagas restantes', () => {
  const combos: Combo[] = [
    { pair: 'BTCUSDT', strategyId: 1 }, // peso baixo
    { pair: 'BTCUSDT', strategyId: 2 }, // peso alto
    { pair: 'BTCUSDT', strategyId: 3 }, // peso médio
  ];
  const weights = new Map([[1, 0.3], [2, 1.0], [3, 0.6]]);
  const result = allocateComboCapacity(combos, new Map(), 2, weights);
  assert.deepEqual(result.allowed, [{ pair: 'BTCUSDT', strategyId: 2 }, { pair: 'BTCUSDT', strategyId: 3 }]);
});

test('allocateComboCapacity — nunca extrapola o teto por par mesmo com várias estratégias competindo', () => {
  const combos: Combo[] = Array.from({ length: 5 }, (_, i) => ({ pair: 'BTCUSDT', strategyId: i + 1 }));
  const result = allocateComboCapacity(combos, new Map(), 2);
  assert.equal(result.allowed.length, 2);
});
