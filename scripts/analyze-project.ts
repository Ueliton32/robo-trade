import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // 1. Checa conexão e dados existentes
    const signalCount = await prisma.signal.count({
      where: { source: 'live' }
    });
    console.log(`Sinais live totais: ${signalCount}`);

    // 2. Sinais por estratégia com status
    const byStrategy = await prisma.signal.groupBy({
      by: ['strategyId', 'status'],
      where: { source: 'live' },
      _count: true,
    });
    console.log('\nSinais por estratégia e status:');
    for (const row of byStrategy) {
      console.log(`  Estr ${row.strategyId} | ${row.status}: ${row._count}`);
    }

    // 3. Sinais fechados por estratégia (WIN/LOSS)
    const closedByStrategy = await prisma.signal.groupBy({
      by: ['strategyId'],
      where: { source: 'live', status: { in: ['WIN', 'LOSS'] } },
      _count: true,
      _sum: {
        pnlPercent: true,
        pnlNetPercent: true,
      },
    });
    console.log('\nSinais fechados (WIN/LOSS) por estratégia:');
    for (const row of closedByStrategy) {
      console.log(`  Estr ${row.strategyId}: ${row._count} trades, PnL bruto: ${(row._sum.pnlPercent || 0).toFixed(2)}%, PnL líq: ${(row._sum.pnlNetPercent || 0).toFixed(2)}%`);
    }

    // 4. RadarContextScan — estratégia 1 com regime filter
    const radarStrategy1 = await prisma.radarContextScan.findMany({
      where: { strategyId: 1 },
      orderBy: { filteredPF: 'desc' },
      take: 20,
    });
    console.log(`\nRadarContextScan (estr 1) — top 20 por filteredPF:`);
    for (const r of radarStrategy1) {
      console.log(`  ${r.pair} ${r.timeframe} ${r.months}mo: sozinho PF=${r.unfilteredPF.toFixed(2)} (${r.unfilteredTrades}t) | filtrado PF=${r.filteredPF.toFixed(2)} (${r.filteredTrades}t) | detectados=${r.totalDetected} aceitos=${r.totalAccepted}`);
    }

    // 5. RadarContextScan — estratégias 4 e 5 (dreno potencial)
    for (const sid of [4, 5]) {
      const radar = await prisma.radarContextScan.findMany({
        where: { strategyId: sid },
        orderBy: { filteredPF: 'desc' },
        take: 15,
      });
      console.log(`\nRadarContextScan (estr ${sid}) — top 15:`);
      for (const r of radar) {
        console.log(`  ${r.pair} ${r.timeframe} ${r.months}mo: sozinho PF=${r.unfilteredPF.toFixed(2)} (${r.unfilteredTrades}t) | filtrado PF=${r.filteredPF.toFixed(2)} (${r.filteredTrades}t) | detectados=${r.totalDetected} aceitos=${r.totalAccepted}`);
      }
    }

    // 6. Sinais recentes da estratégia 1
    const recentStrat1 = await prisma.signal.findMany({
      where: { source: 'live', strategyId: 1, status: { in: ['WIN', 'LOSS'] } },
      orderBy: { closedAt: 'desc' },
      take: 30,
      select: { id: true, pair: true, timeframe: true, direction: true, status: true, pnlPercent: true, pnlNetPercent: true, createdAt: true, closedAt: true, marketRegime: true, riskRewardRatio: true },
    });
    console.log(`\nSinais recentes da estratégia 1 (últimos 30 fechados):`);
    for (const s of recentStrat1) {
      console.log(`  ${s.pair} ${s.timeframe} ${s.direction} → ${s.status} | PnL: ${(s.pnlPercent || 0).toFixed(2)}% | líq: ${(s.pnlNetPercent || 0).toFixed(2)}% | R:R ${(s.riskRewardRatio || 0).toFixed(2)} | regime: ${s.marketRegime || 'N/A'} | ${s.createdAt?.toISOString().slice(0,10)}`);
    }

    // 7. Estratégia 1: win rate por regime (se houver dados)
    const strat1ByRegime = await prisma.signal.groupBy({
      by: ['marketRegime'],
      where: { source: 'live', strategyId: 1, status: { in: ['WIN', 'LOSS'] }, marketRegime: { not: null } },
      _count: true,
      _sum: {
        pnlPercent: true,
        pnlNetPercent: true,
      },
    });
    console.log('\nEstratégia 1 — por regime de mercado (fechados):');
    for (const row of strat1ByRegime) {
      const wins = await prisma.signal.count({
        where: { source: 'live', strategyId: 1, status: 'WIN', marketRegime: row.marketRegime }
      });
      const total = row._count;
      console.log(`  ${row.marketRegime}: ${total} trades, ${wins} WIN (${wins/total*100 | 0}%), PnL líq: ${(row._sum.pnlNetPercent || 0).toFixed(2)}%`);
    }

    // 8. Estratégia 1: win rate por timeframe
    const strat1ByTF = await prisma.signal.groupBy({
      by: ['timeframe'],
      where: { source: 'live', strategyId: 1, status: { in: ['WIN', 'LOSS'] } },
      _count: true,
      _sum: { pnlNetPercent: true },
    });
    console.log('\nEstratégia 1 — por timeframe (fechados):');
    for (const row of strat1ByTF) {
      const wins = await prisma.signal.count({
        where: { source: 'live', strategyId: 1, status: 'WIN', timeframe: row.timeframe }
      });
      const total = row._count;
      console.log(`  ${row.timeframe}: ${total} trades, ${wins} WIN (${wins/total*100 | 0}%), PnL líq: ${(row._sum.pnlNetPercent || 0).toFixed(2)}%`);
    }

    // 9. BacktestScan — estratégia 1
    const backtestStrat1 = await prisma.backtestScan.findMany({
      where: { strategyId: 1 },
      orderBy: { profitFactor: 'desc' },
      take: 15,
    });
    console.log('\nBacktestScan (estr 1) — top 15 por profitFactor:');
    for (const b of backtestStrat1) {
      console.log(`  ${b.pair} ${b.timeframe} ${b.months}mo: ${b.totalTrades}t, WR=${b.winRate.toFixed(0)}%, PF=${b.profitFactor.toFixed(2)}, Exp=${b.expectancy.toFixed(2)}%, DD=${b.maxDrawdown.toFixed(1)}%`);
    }

    // 10. Circuit breakers ativos
    const breakers = await prisma.riskCircuitBreaker.findMany({
      where: { tripped: true },
    });
    console.log(`\nCircuit breakers ativos: ${breakers.length}`);
    for (const b of breakers) {
      console.log(`  ${b.key}: ${b.reason?.slice(0,100)} | valor=${b.metricValue?.toFixed(2)} lim=${b.threshold?.toFixed(2)}`);
    }

    // 11. Total de sinais PENDING
    const pendingCount = await prisma.signal.count({
      where: { source: 'live', status: 'PENDENTE' }
    });
    console.log(`\nSinais PENDENTE ao vivo: ${pendingCount}`);

    // 12. Estratégias ativas nas configurações (global plan)
    const planResult = await prisma.userSettings.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { pairStrategies: true, monitoredPairs: true, enabledStrategies: true },
    });
    console.log('\nConfiguração mais recente:');
    if (planResult) {
      console.log(`  Pares monitorados: ${JSON.stringify(planResult.monitoredPairs)}`);
      console.log(`  Estratégias habilitadas: ${JSON.stringify(planResult.enabledStrategies)}`);
      console.log(`  Estratégia por par: ${JSON.stringify(planResult.pairStrategies)}`);
    }

  } catch (e: any) {
    console.error('ERRO:', e?.message || e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
