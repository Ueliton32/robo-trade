import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Executando recompute de pesos (após mudanças de 08/09) ===\n');

  const { recomputeStrategyWeights } = await import('../lib/strategy-weights');
  const { STRATEGY_DEFS } = await import('../lib/strategies');

  const results = await recomputeStrategyWeights(60); // 60 dias lookback

  console.log('Peso calculado por estratégia:');
  for (const r of results) {
    const flag = r.neutral ? ' (neutro — amostra insuficiente)' : '';
    console.log(`  Estr ${r.strategyId} (${r.strategyName}): peso=${r.weight.toFixed(2)} | expectancy=${r.rawExpectancyNet?.toFixed(3) ?? 'N/A'}% | amostra=${r.sampleSize}t${flag}`);
  }

  console.log('\n✅ Pesos persistidos no banco');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERRO:', e?.message || e);
  process.exit(1);
});
