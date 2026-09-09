import { PrismaClient } from '@prisma/client';
import { computeMetrics, TradeLike } from '@/lib/metrics';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Recalculando estatísticas (após remover estratégia 2) ===\n');

  // 1. Estatísticas por estratégia
  const stratIds = [1, 3, 4, 5, 6];
  for (const id of stratIds) {
    const trades = await prisma.signal.findMany({
      where: { source: 'live', strategyId: id, status: { in: ['WIN', 'LOSS'] } },
      orderBy: { closedAt: 'asc' },
      select: { status: true, pnlPercent: true, createdAt: true, closedAt: true, pair: true, timeframe: true },
    });

    const metrics = computeMetrics(trades as TradeLike[]);
    const wins = trades.filter(t => t.status === 'WIN').length;
    const losses = trades.filter(t => t.status === 'LOSS').length;

    console.log(`Estratégia ${id}: ${trades.length} trades, ${wins}W/${losses}L, WR=${metrics.winRate.toFixed(1)}%, PF=${metrics.profitFactor.toFixed(2)}, Exp=${metrics.expectancy.toFixed(2)}%, DD=${metrics.maxDrawdown.toFixed(1)}%`);

    await prisma.strategyStats.upsert({
      where: { strategyId: id },
      update: {
        winRate: metrics.winRate,
        payoff: metrics.payoff,
        profitFactor: metrics.profitFactor,
        maxDrawdown: metrics.maxDrawdown,
        expectancy: metrics.expectancy,
        totalTrades: trades.length,
        wins,
        losses,
      },
      create: {
        strategyId: id,
        strategyName: 'Estratégia ' + id,
        description: '',
        ...metrics,
        bestAssets: [],
        bestHours: [],
        bestTimeframes: [],
      },
    });
  }

  // 2. Win rate agregado (sem estratégia 2)
  const allClosed = await prisma.signal.findMany({
    where: { source: 'live', status: { in: ['WIN', 'LOSS'] }, strategyId: { not: 2 } },
    select: { status: true },
  });

  const wins = allClosed.filter(s => s.status === 'WIN').length;
  const total = allClosed.length;
  const newWinRate = total > 0 ? (wins / total * 100) : 0;

  console.log(`\n=== WIN RATE AGREGADO (sem estratégia 2) ===`);
  console.log(`Trades: ${total} (WIN: ${wins}, LOSS: ${total - wins})`);
  console.log(`Win Rate: ${newWinRate.toFixed(1)}%`);
  console.log(`Antigo (com estratégia 2): 43% (estimado)`);
  console.log(`Melhora: +${(newWinRate - 43).toFixed(1)}pp`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERRO:', e?.message || e);
  process.exit(1);
});
