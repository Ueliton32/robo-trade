import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== RadarContextScan — Estratégia 1 (ROC) — Amostra de 6 combos chave ===\n');
  console.log('Pares: BTCUSDT, ETHUSDT, SOLUSDT, BNBUSDT, XRPUSDT, AVAXUSDT');
  console.log('Timeframes: 15m, 1h, 4h → 18 combos\n');

  const pairs = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'AVAXUSDT'];
  const tfs = ['15m', '1h', '4h'];

  let improved = 0, worse = 0, neutral = 0, noData = 0;
  let idx = 0;

  for (const pair of pairs) {
    for (const tf of tfs) {
      idx++;
      const progress = `${idx}/18 — ${pair} ${tf}`;

      try {
        const { backtestRegimeFilteredStrategy } = await import('../lib/radar-context-backtest');

        const result = await backtestRegimeFilteredStrategy({
          strategyId: 1,
          pair,
          timeframe: tf,
          months: 3,
        });

        const u = result.unfilteredMetrics;
        const f = result.filteredMetrics;

        const hasUnfiltered = u.totalTrades >= 10;
        const hasFiltered = f.totalTrades >= 5;

        let status: string;
        if (!hasUnfiltered) {
          status = 'SEM DADOS';
          noData++;
        } else if (!hasFiltered) {
          status = 'RESTRITIVO';
          neutral++;
        } else if (f.profitFactor > u.profitFactor * 1.1) {
          status = '✅ MELHORADO';
          improved++;
        } else if (f.profitFactor < u.profitFactor * 0.9) {
          status = '❌ PIOR';
          worse++;
        } else {
          status = '→ MANTEU';
          neutral++;
        }

        console.log(`${progress}:`);
        console.log(`  Sozinho:  ${u.totalTrades}t, WR=${u.winRate.toFixed(0)}%, PF=${u.profitFactor.toFixed(2)}, Exp=${u.expectancy.toFixed(2)}%, DD=${u.maxDrawdown.toFixed(1)}%`);
        console.log(`  Filtrado: ${f.totalTrades}t, WR=${f.winRate.toFixed(0)}%, PF=${f.profitFactor.toFixed(2)}, Exp=${f.expectancy.toFixed(2)}%, DD=${f.maxDrawdown.toFixed(1)}%`);
        console.log(`  ${status}\n`);

        await prisma.radarContextScan.upsert({
          where: { strategyId_pair_timeframe_months: { strategyId: 1, pair, timeframe: tf, months: 3 } },
          update: {
            strategyName: 'Rompimento de Range',
            totalDetected: result.totalSignalsDetected,
            totalAccepted: result.totalAcceptedByRegime,
            unfilteredTrades: u.totalTrades,
            unfilteredWinRate: u.winRate,
            unfilteredPF: u.profitFactor,
            unfilteredExp: u.expectancy,
            filteredTrades: f.totalTrades,
            filteredWinRate: f.winRate,
            filteredPF: f.profitFactor,
            filteredExp: f.expectancy,
          },
          create: {
            strategyId: 1,
            strategyName: 'Rompimento de Range',
            pair,
            timeframe: tf,
            months: 3,
            totalDetected: result.totalSignalsDetected,
            totalAccepted: result.totalAcceptedByRegime,
            unfilteredTrades: u.totalTrades,
            unfilteredWinRate: u.winRate,
            unfilteredPF: u.profitFactor,
            unfilteredExp: u.expectancy,
            filteredTrades: f.totalTrades,
            filteredWinRate: f.winRate,
            filteredPF: f.profitFactor,
            filteredExp: f.expectancy,
          },
        });

      } catch (e: any) {
        console.log(`${progress} — ERRO: ${e?.message?.slice(0, 80)}\n`);
      }
    }
  }

  console.log('=== RESUMO ===');
  console.log(`Total: 18`);
  console.log(`Melhorou com filtro: ${improved}`);
  console.log(`Piorou com filtro: ${worse}`);
  console.log(`Manteve/neutro: ${neutral}`);
  console.log(`Sem dados suficientes: ${noData}`);
  console.log(`Taxa de melhora: ${improved > 0 ? improved + '/' + (improved + worse + neutral) + ' (' + (improved / (improved + worse + neutral) * 100).toFixed(0) + '%)' : 'sem dados'}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERRO FATAL:', e?.message || e);
  process.exit(1);
});
