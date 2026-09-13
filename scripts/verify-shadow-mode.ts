/**
 * Verifica se há sinais shadow no banco e compara com paper signals.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('═'.repeat(60));
  console.log('Verificação: Sinais Shadow vs Paper após ativação do SHADOW mode');
  console.log('═'.repeat(60));
  console.log(`Data: ${new Date().toLocaleString('pt-BR')}`);
  console.log('');

  // Sinais shadow
  const shadowSignals = await prisma.signal.findMany({
    where: { source: { startsWith: 'shadow_v' } },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      strategyId: true,
      strategyName: true,
      pair: true,
      direction: true,
      timeframe: true,
      source: true,
      createdAt: true,
      marketRegime: true,
      confidence: true,
    },
  });

  // Sinais paper/live
  const paperSignals = await prisma.signal.findMany({
    where: {
      source: { in: ['live', 'PAPER_TRADING'] },
      executionMode: 'PAPER_TRADING',
    },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      strategyId: true,
      strategyName: true,
      pair: true,
      direction: true,
      timeframe: true,
      source: true,
      createdAt: true,
      marketRegime: true,
      confidence: true,
    },
  });

  const [shadowCount, paperCount] = await Promise.all([
    prisma.signal.count({ where: { source: { startsWith: 'shadow_v' } } }),
    prisma.signal.count({ where: { source: { in: ['live', 'PAPER_TRADING'] }, executionMode: 'PAPER_TRADING' } }),
  ]);

  console.log(`📊 Resumo:`);
  console.log(`   Shadow signals no banco: ${shadowCount}`);
  console.log(`   Paper/live signals no banco: ${paperCount}`);
  console.log('');

  if (shadowCount === 0) {
    console.log('⚠ Nenhum sinal shadow encontrado.');
    console.log('   O scheduler ainda não rodou com EXECUTION_MODE=SHADOW ou');
    console.log('   o servidor não foi reiniciado após a mudança do .env.');
    console.log('');
  } else {
    console.log(`📈 Últimos ${Math.min(shadowSignals.length, 10)} sinais shadow:`);
    console.log('-'.repeat(80));
    console.log(`${'ID'.padEnd(20)} ${'Strat'.padEnd(6)} ${'Par'.padEnd(12)} ${'Dir'.padEnd(6)} ${'TF'.padEnd(5)} ${'Regime'.padEnd(24)} ${'Conf'.padEnd(6)} ${'CreatedAt'.padEnd(22)}`);
    console.log('-'.repeat(80));
    for (const s of shadowSignals.slice(0, 10)) {
      console.log(
        `${s.id.padEnd(20)} ${String(s.strategyId).padEnd(6)} ${s.pair.padEnd(12)} ${s.direction.padEnd(6)} ${s.timeframe.padEnd(5)} ${(s.marketRegime ?? 'N/A').padEnd(24)} ${s.confidence?.toFixed(2).padEnd(6)} ${s.createdAt.toLocaleString('pt-BR').padEnd(22)}`
      );
    }
  }

  if (paperCount > 0 && shadowCount > 0) {
    console.log('');
    console.log(`📈 Últimos ${Math.min(paperSignals.length, 5)} sinais paper (para comparação):`);
    console.log('-'.repeat(80));
    console.log(`${'ID'.padEnd(20)} ${'Strat'.padEnd(6)} ${'Par'.padEnd(12)} ${'Dir'.padEnd(6)} ${'TF'.padEnd(5)} ${'Regime'.padEnd(24)} ${'Conf'.padEnd(6)} ${'CreatedAt'.padEnd(22)}`);
    console.log('-'.repeat(80));
    for (const s of paperSignals.slice(0, 5)) {
      console.log(
        `${s.id.padEnd(20)} ${String(s.strategyId).padEnd(6)} ${s.pair.padEnd(12)} ${s.direction.padEnd(6)} ${s.timeframe.padEnd(5)} ${(s.marketRegime ?? 'N/A').padEnd(24)} ${s.confidence?.toFixed(2).padEnd(6)} ${s.createdAt.toLocaleString('pt-BR').padEnd(22)}`
      );
    }
  }

  console.log('');
  console.log('═'.repeat(60));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
