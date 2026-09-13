import { PrismaClient } from '@prisma/client';
import { STRATEGY_DEFS } from '../lib/strategies';
import { backtestRegimeFilteredStrategy } from '../lib/radar-context-backtest';

const prisma = new PrismaClient();

// AMOSTRA: 10 pares prioritários (os com mais volume/mais trades na estratégia 1)
const SAMPLE_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'ADAUSDT', 'LINKUSDT', 'AVAXUSDT', 'SUIUSDT', 'WLDUSDT',
];

const TIMEFRAMES = ['15m', '1h', '4h'];

async function main() {
  console.log('=== RadarContextScan AMOSTRA — Estratégia 1 (Rompimento de Range) ===\n');
  console.log(`Amostra: ${SAMPLE_PAIRS.length} pares × ${TIMEFRAMES.length} timeframes = ${SAMPLE_PAIRS.length * TIMEFRAMES.length} combos\n`);

  let improved = 0;
  let worse = 0;
  let neutral = 0;
  let noData = 0;

  for (const pair of SAMPLE_PAIRS) {
    for (const tf of TIMEFRAMES) {
      const progress = `${pair} ${tf}`;

      try {
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
          status = 'SEM DADOS (menos de 10 trades não-filtrados)';
          noData++;
        } else if (!hasFiltered) {
          status = `Filtro muito restritivo (${f.totalTrades}/${u.totalTrades} aceitos)`;
          neutral++;
        } else {
          const unfilteredPF = u.profitFactor;
          const filteredPF = f.profitFactor;

          if (filteredPF > unfilteredPF * 1.1) {
            status = `✅ MELHORADO: PF ${unfilteredPF.toFixed(2)} → ${filteredPF.toFixed(2)}`;
            improved++;
          } else if (filteredPF < unfilteredPF * 0.9) {
            status = `❌ PIOR: PF ${unfilteredPF.toFixed(2)} → ${filteredPF.toFixed(2)}`;
            worse++;
          } else {
            status = `→ MANTEU: PF ${unfilteredPF.toFixed(2)} → ${filteredPF.toFixed(2)}`;
            neutral++;
          }
        }

        console.log(`${progress}:`);
        console.log(`  Sozinho:  ${u.totalTrades}t, WR=${u.winRate.toFixed(0)}%, PF=${u.profitFactor.toFixed(2)}, Exp=${u.expectancy.toFixed(2)}%, DD=${u.maxDrawdown.toFixed(1)}%`);
        console.log(`  Filtrado: ${f.totalTrades}t, WR=${f.winRate.toFixed(0)}%, PF=${f.profitFactor.toFixed(2)}, Exp=${f.expectancy.toFixed(2)}%, DD=${f.maxDrawdown.toFixed(1)}%`);
        console.log(`  ${status}\n`);

        // Salva no banco
        await prisma.radarContextScan.upsert({
          where: {
            strategyId_pair_timeframe_months: {
              strategyId: 1,
              pair,
              timeframe: tf,
              months: 3,
            },
          },
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
            runAt: new Date(),
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

  console.log('=== RESUMO DA AMOSTRA ===');
  console.log(`Total: ${SAMPLE_PAIRS.length * TIMEFRAMES.length}`);
  console.log(`Melhorou: ${improved} (${(improved / (SAMPLE_PAIRS.length * TIMEFRAMES.length) * 100).toFixed(1)}%)`);
  console.log(`Piorou: ${worse}`);
  console.log(`Manteve/neutro: ${neutral}`);
  console.log(`Sem dados suficientes: ${noData}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERRO FATAL:', e?.message || e);
  process.exit(1);
});
