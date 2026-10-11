/**
 * Checagem do checkLossStreak (lib/circuit-breakers.ts): o resultado tem que
 * ser IGUAL à contagem sem janela nenhuma (varre todo o histórico, já descartando
 * combinações inativas E direções bloqueadas — isComboActive com direção), com lote
 * grande e com lote minúsculo (força a paginação em vários lotes). Falha
 * (exit 1) se divergir. Só leitura.
 *
 *   npx tsx --require dotenv/config scripts/check-loss-streak.ts
 */
import assert from 'node:assert/strict';
import { prisma } from '../lib/prisma';
import { checkLossStreak } from '../lib/circuit-breakers';
import { getGlobalPairStrategyPlan, isComboActive } from '../lib/pair-strategy-plan';

async function main() {
  const all = await prisma.signal.findMany({
    where: { source: 'live', status: { in: ['WIN', 'LOSS'] } },
    orderBy: [{ closedAt: 'desc' }, { id: 'asc' }],
    select: { status: true, pair: true, strategyId: true, direction: true },
  });
  const plan = await getGlobalPairStrategyPlan();
  let expected = 0;
  for (const s of all.filter((x) => isComboActive(plan, x.pair, x.strategyId, x.direction))) { if (s.status === 'LOSS') expected++; else break; }
  console.log(`Sem janela (${all.length} fechados): sequência ativa = ${expected}`);

  for (const batch of [100, 7, 1]) {
    const r = await checkLossStreak(batch);
    console.log(`  lote ${String(batch).padStart(3)}: ${r.metricValue}`);
    assert.equal(r.metricValue, expected, `lote ${batch} divergiu da contagem sem janela`);
  }
  console.log('OK — igual à contagem sem janela em todos os tamanhos de lote.');
}

main().catch((e) => { console.error('FALHOU:', e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
