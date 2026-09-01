/**
 * Scanner em massa: roda o backtest de TODAS as combinações de
 * estratégia × moeda × timeframe válido, uma a uma, e salva o resultado
 * agregado de cada uma na tabela BacktestScan — pra você não precisar
 * clicar 100+ vezes na tela de Backtest.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/backtest-scan.ts
 *   (ou, via package.json: npm run backtest:scan)
 *
 * Isso pode levar BASTANTE tempo (são ~294 combinações, cada uma buscando
 * histórico real da Binance) — de uns 30 minutos a bem mais, dependendo de
 * quantas moedas/timeframes. Rode num terminal que você possa deixar
 * aberto em segundo plano.
 *
 * Combinações já salvas são puladas automaticamente (então dá pra parar
 * com Ctrl+C e retomar depois de onde ficou). Pra refazer tudo do zero
 * (ex: depois de mudar a lógica de uma estratégia), rode com --force:
 *   npx tsx --require dotenv/config scripts/backtest-scan.ts --force
 *
 * Pra rodar só UMA estratégia (ex: depois de corrigir só ela, sem esperar
 * as outras 5 de novo), use --strategy=N:
 *   npx tsx --require dotenv/config scripts/backtest-scan.ts --strategy=1 --force
 *
 * Período de cada backtest configurável via .env: SCAN_MONTHS (padrão: 3)
 */
import { prisma } from '../lib/prisma';
import { STRATEGY_DEFS, ALL_AVAILABLE_PAIRS } from '../lib/strategies';
import { runBacktest } from '../lib/backtest-engine';
import { getGlobalPairStrategyPlan } from '../lib/analysis-engine';

const MONTHS = Math.max(1, parseInt(process.env.SCAN_MONTHS ?? '3', 10) || 3);
const FORCE = process.argv.includes('--force');
const STRATEGY_FILTER_ARG = process.argv.find((a) => a.startsWith('--strategy='));
const STRATEGY_FILTER = STRATEGY_FILTER_ARG ? parseInt(STRATEGY_FILTER_ARG.split('=')[1], 10) : null;
const DELAY_BETWEEN_COMBOS_MS = 300;

interface Combo {
  strategyId: number;
  strategyName: string;
  timeframe: string;
  pair: string;
}

/**
 * Além dos 21 pares curados (ALL_AVAILABLE_PAIRS), inclui qualquer par
 * "custom" que algum usuário já tenha adicionado via Configurações e que
 * esteja rodando ao vivo agora (getGlobalPairStrategyPlan) — achado do
 * stability-scan de 14/08/2026: pares fora da lista curada nunca tinham
 * baseline nenhum, e o circuit breaker de divergência não tinha como
 * compará-los contra nada até esse gap ser fechado (ver
 * ABSOLUTE_PF_FLOOR_NO_BASELINE em lib/divergence-check.ts, que cobre o
 * meio-tempo até esse scan rodar). Sem isso, um par novo adicionado por
 * qualquer usuário nunca ganhava baseline de verdade.
 */
async function buildCombos(): Promise<Combo[]> {
  const livePlan = await getGlobalPairStrategyPlan();
  const pairSet = new Set<string>([...ALL_AVAILABLE_PAIRS, ...Object.keys(livePlan)]);

  const combos: Combo[] = [];
  for (const strat of STRATEGY_DEFS) {
    if (STRATEGY_FILTER !== null && strat.id !== STRATEGY_FILTER) continue;
    for (const timeframe of strat.timeframes) {
      for (const pair of pairSet) {
        combos.push({ strategyId: strat.id, strategyName: strat.name, timeframe, pair });
      }
    }
  }
  return combos;
}

function log(msg: string) {
  console.log(`[scan ${new Date().toISOString()}] ${msg}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const combos = await buildCombos();
  log(`Total de combinações: ${combos.length} (${MONTHS} ${MONTHS === 1 ? 'mês' : 'meses'} cada). Force=${FORCE}`);

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const combo of combos) {
    done++;
    const progress = `[${done}/${combos.length}]`;

    if (!FORCE) {
      const existing = await prisma.backtestScan.findUnique({
        where: {
          strategyId_pair_timeframe_months: {
            strategyId: combo.strategyId,
            pair: combo.pair,
            timeframe: combo.timeframe,
            months: MONTHS,
          },
        },
      });
      if (existing) {
        skipped++;
        continue;
      }
    }

    try {
      const result = await runBacktest({
        strategyId: combo.strategyId,
        pair: combo.pair,
        timeframe: combo.timeframe,
        months: MONTHS,
      });
      const m = result.metrics;

      await prisma.backtestScan.upsert({
        where: {
          strategyId_pair_timeframe_months: {
            strategyId: combo.strategyId,
            pair: combo.pair,
            timeframe: combo.timeframe,
            months: MONTHS,
          },
        },
        update: {
          strategyName: combo.strategyName,
          totalTrades: m.totalTrades,
          wins: m.wins,
          losses: m.losses,
          winRate: m.winRate,
          payoff: m.payoff,
          profitFactor: m.profitFactor,
          maxDrawdown: m.maxDrawdown,
          expectancy: m.expectancy,
          runAt: new Date(),
        },
        create: {
          strategyId: combo.strategyId,
          strategyName: combo.strategyName,
          pair: combo.pair,
          timeframe: combo.timeframe,
          months: MONTHS,
          totalTrades: m.totalTrades,
          wins: m.wins,
          losses: m.losses,
          winRate: m.winRate,
          payoff: m.payoff,
          profitFactor: m.profitFactor,
          maxDrawdown: m.maxDrawdown,
          expectancy: m.expectancy,
        },
      });

      log(`${progress} ${combo.pair} × ${combo.strategyName} × ${combo.timeframe} → ${m.totalTrades} trades, PF ${m.profitFactor.toFixed(2)}, exp ${m.expectancy.toFixed(2)}%`);
    } catch (e: any) {
      failed++;
      log(`${progress} ${combo.pair} × ${combo.strategyName} × ${combo.timeframe} → ERRO: ${e?.message ?? e}`);
    }

    await sleep(DELAY_BETWEEN_COMBOS_MS);
  }

  log(`Concluído. ${done - skipped - failed} rodados, ${skipped} pulados (já existiam), ${failed} com erro.`);
  log('Veja o relatório completo na aba Backtest → "Relatório do Scan" no dashboard.');
}

main()
  .catch((e) => {
    console.error('[scan] Falha fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
