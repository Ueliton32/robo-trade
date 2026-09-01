/**
 * Scanner em massa do motor de contexto (regime + gatilho validado) —
 * roda contra o universo DINÂMICO de até 100 pares por volume real da
 * Binance, não a lista curada de sempre. É o item 2 do plano de melhoria
 * combinado em 11/08/2026.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/radar-context-scan.ts
 *   (ou: npm run radar:scan)
 *
 * São 5 estratégias × seus timeframes válidos × até 100 pares — bem mais
 * pesado que o scan original das 6 estratégias (aquele buscava só o
 * gatilho; esse busca o gatilho E alinha o regime candle a candle pra
 * cada sinal encontrado). Espere isso rodar por várias horas — deixe num
 * terminal em background.
 *
 * Trap de Liquidez (estratégia 3) fica de fora — o mapa de contexto dela
 * está vazio hoje (nenhum regime a libera), então o resultado filtrado
 * seria sempre zero, sem informação nova.
 *
 * Combinações já salvas são puladas automaticamente (retomável com
 * Ctrl+C). Pra refazer tudo: --force. Pra rodar só uma estratégia:
 * --strategy=N.
 */
import { prisma } from '../lib/prisma';
import { STRATEGY_DEFS } from '../lib/strategies';
import { getRadarUniverse } from '../lib/universe';
import { backtestRegimeFilteredStrategy } from '../lib/radar-context-backtest';

const MONTHS = Math.max(1, parseInt(process.env.SCAN_MONTHS ?? '2', 10) || 2);
const FORCE = process.argv.includes('--force');
const STRATEGY_FILTER_ARG = process.argv.find((a) => a.startsWith('--strategy='));
const STRATEGY_FILTER = STRATEGY_FILTER_ARG ? parseInt(STRATEGY_FILTER_ARG.split('=')[1], 10) : null;
const UNIVERSE_SIZE = Math.max(1, parseInt(process.env.RADAR_SCAN_UNIVERSE ?? '100', 10) || 100);
const DELAY_BETWEEN_COMBOS_MS = 400;

const EXCLUDED_STRATEGIES = [3]; // Trap de Liquidez — mapa de contexto vazio hoje

interface Combo {
  strategyId: number;
  strategyName: string;
  timeframe: string;
  pair: string;
}

function log(msg: string) {
  console.log(`[radar-scan ${new Date().toISOString()}] ${msg}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  log(`Buscando universo de at\u00e9 ${UNIVERSE_SIZE} pares por volume real...`);
  const universe = await getRadarUniverse(UNIVERSE_SIZE);
  log(`Universo: ${universe.length} pares.`);

  const combos: Combo[] = [];
  for (const strat of STRATEGY_DEFS) {
    // Excluída do scan completo (padrão) por não ter contexto de regime
    // definido — mas se pedida explicitamente via --strategy=N, roda
    // mesmo assim (a coluna "sozinho" continua útil, só a "filtrada"
    // sempre vai ficar zerada, o que é esperado).
    if (EXCLUDED_STRATEGIES.includes(strat.id) && STRATEGY_FILTER === null) continue;
    if (STRATEGY_FILTER !== null && strat.id !== STRATEGY_FILTER) continue;
    for (const timeframe of strat.timeframes) {
      for (const p of universe) {
        combos.push({ strategyId: strat.id, strategyName: strat.name, timeframe, pair: p.symbol });
      }
    }
  }

  log(`Total de combina\u00e7\u00f5es: ${combos.length} (${MONTHS} m\u00eas(es) cada). Force=${FORCE}`);

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const combo of combos) {
    done++;
    const progress = `[${done}/${combos.length}]`;

    if (!FORCE) {
      const existing = await prisma.radarContextScan.findUnique({
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
      const result = await backtestRegimeFilteredStrategy({
        strategyId: combo.strategyId,
        pair: combo.pair,
        timeframe: combo.timeframe,
        months: MONTHS,
      });

      const u = result.unfilteredMetrics;
      const f = result.filteredMetrics;

      await prisma.radarContextScan.upsert({
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
          strategyId: combo.strategyId,
          strategyName: combo.strategyName,
          pair: combo.pair,
          timeframe: combo.timeframe,
          months: MONTHS,
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

      log(`${progress} ${combo.pair} \u00d7 ${combo.strategyName} \u00d7 ${combo.timeframe} \u2192 sozinho PF=${u.profitFactor.toFixed(2)} (${u.totalTrades}t) | filtrado PF=${f.profitFactor.toFixed(2)} (${f.totalTrades}t)`);
    } catch (e: any) {
      failed++;
      log(`${progress} ${combo.pair} \u00d7 ${combo.strategyName} \u00d7 ${combo.timeframe} \u2192 ERRO: ${e?.message ?? e}`);
    }

    await sleep(DELAY_BETWEEN_COMBOS_MS);
  }

  log(`Conclu\u00eddo. ${done - skipped - failed} rodados, ${skipped} pulados (j\u00e1 existiam), ${failed} com erro.`);
  log('Veja o relat\u00f3rio na aba Radar \u2192 "Relat\u00f3rio do Scan de Contexto" no dashboard.');
}

main()
  .catch((e) => {
    console.error('[radar-scan] Falha fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
