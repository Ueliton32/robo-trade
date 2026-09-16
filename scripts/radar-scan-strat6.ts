import { PrismaClient } from '@prisma/client';
import { backtestRegimeFilteredStrategy } from '../lib/radar-context-backtest';

const prisma = new PrismaClient();

// Pares que a estratégia 6 (Compressão de Volatilidade) opera hoje ao vivo
// (ver lib/pair-strategy-plan.ts, getGlobalPairStrategyPlan — checado em 16/09/2026).
const PAIRS_FOR_STRAT6 = ['BNBUSDT', 'XRPUSDT', 'XLMUSDT', 'TAOUSDT', 'ZECUSDT', 'BCHUSDT', 'UNIUSDT'];
const TIMEFRAMES = ['1h', '4h', '1d']; // timeframes reais da estratégia (lib/strategies.ts)
const MONTHS = 3;

async function main() {
  console.log('=== RadarContextScan — Estratégia 6 (Compressão de Volatilidade) ===\n');
  console.log(`Pares: ${PAIRS_FOR_STRAT6.length} | Timeframes: ${TIMEFRAMES.length} | Combos: ${PAIRS_FOR_STRAT6.length * TIMEFRAMES.length}\n`);

  let total = 0, improved = 0, worse = 0, neutral = 0, noData = 0;

  for (const pair of PAIRS_FOR_STRAT6) {
    for (const tf of TIMEFRAMES) {
      total++;
      const progress = `${total}/${PAIRS_FOR_STRAT6.length * TIMEFRAMES.length} — ${pair} ${tf}`;

      try {
        const result = await backtestRegimeFilteredStrategy({
          strategyId: 6,
          pair,
          timeframe: tf,
          months: MONTHS,
        });

        const u = result.unfilteredMetrics;
        const f = result.filteredMetrics;

        const hasUnfiltered = u.totalTrades >= 10;
        const hasFiltered = f.totalTrades >= 5;

        let status: string;
        if (!hasUnfiltered) {
          status = 'sem dados suficientes (menos de 10 trades não-filtrados)';
          noData++;
        } else if (!hasFiltered) {
          status = `filtro muito restritivo (${f.totalTrades}/${u.totalTrades} trades aceitos)`;
          neutral++;
        } else {
          const unfilteredPF = u.profitFactor;
          const filteredPF = f.profitFactor;
          if (filteredPF > unfilteredPF * 1.1) {
            status = `✅ MELHOROU — PF ${unfilteredPF.toFixed(2)} → ${filteredPF.toFixed(2)}`;
            improved++;
          } else if (filteredPF < unfilteredPF * 0.9) {
            status = `❌ PIOROU — PF ${unfilteredPF.toFixed(2)} → ${filteredPF.toFixed(2)}`;
            worse++;
          } else {
            status = `→ MANTEVE — PF ${unfilteredPF.toFixed(2)} → ${filteredPF.toFixed(2)}`;
            neutral++;
          }
        }

        console.log(`${progress}:`);
        console.log(`  Sozinho:  ${u.totalTrades}t, WR=${u.winRate.toFixed(0)}%, PF=${u.profitFactor.toFixed(2)}, Exp=${u.expectancy.toFixed(2)}%, DD=${u.maxDrawdown.toFixed(1)}%`);
        console.log(`  Filtrado: ${f.totalTrades}t, WR=${f.winRate.toFixed(0)}%, PF=${f.profitFactor.toFixed(2)}, Exp=${f.expectancy.toFixed(2)}%, DD=${f.maxDrawdown.toFixed(1)}%`);
        console.log(`  ${status}\n`);

        await prisma.radarContextScan.upsert({
          where: { strategyId_pair_timeframe_months: { strategyId: 6, pair, timeframe: tf, months: MONTHS } },
          update: {
            strategyName: 'Compressão de Volatilidade',
            totalDetected: result.totalSignalsDetected,
            totalAccepted: result.totalAcceptedByRegime,
            unfilteredTrades: u.totalTrades, unfilteredWinRate: u.winRate, unfilteredPF: u.profitFactor, unfilteredExp: u.expectancy,
            filteredTrades: f.totalTrades, filteredWinRate: f.winRate, filteredPF: f.profitFactor, filteredExp: f.expectancy,
            runAt: new Date(),
          },
          create: {
            strategyId: 6, strategyName: 'Compressão de Volatilidade', pair, timeframe: tf, months: MONTHS,
            totalDetected: result.totalSignalsDetected, totalAccepted: result.totalAcceptedByRegime,
            unfilteredTrades: u.totalTrades, unfilteredWinRate: u.winRate, unfilteredPF: u.profitFactor, unfilteredExp: u.expectancy,
            filteredTrades: f.totalTrades, filteredWinRate: f.winRate, filteredPF: f.profitFactor, filteredExp: f.expectancy,
          },
        });
      } catch (e: any) {
        console.log(`${progress} — ERRO: ${e?.message?.slice(0, 150)}`);
      }
    }
  }

  console.log('=== RESUMO ===');
  console.log(`Total: ${total} | Melhorou: ${improved} | Piorou: ${worse} | Manteve/neutro: ${neutral} | Sem dados: ${noData}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error('ERRO FATAL:', e?.message || e); process.exit(1); });
