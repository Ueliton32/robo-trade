/**
 * EXPERIMENTO — item 3 da rodada de melhoria de 03/09/2026. Testa o filtro
 * de regime (lib/radar-context.ts) nas estratégias que nunca passaram por
 * validação com rigor: Funding Extremo (4, mapeada pra ALTA/BAIXA) e
 * Compressão de Volatilidade (6, mapeada pra LATERALIZACAO). Já usa o
 * holdout formal (lib/walk-forward.ts) — só considera candidato quem
 * passar treino E teste >= 1.0, não só o agregado (a mesma armadilha que
 * derrubou AVAX/BCH/DOT no item 2 mais cedo hoje).
 *
 * Uso: npx tsx --require dotenv/config scripts/test-untested-regime-filters.ts
 */
import { backtestRegimeFilteredStrategy, ContextTrade } from '../lib/radar-context-backtest';
import { walkForwardSplit } from '../lib/walk-forward';
import { prisma } from '../lib/prisma';

const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
const STRATEGIES = [
  { id: 4, name: 'Funding Extremo', timeframe: '1h' },
  { id: 6, name: 'Compressão de Volatilidade', timeframe: '1h' },
];

function toTradeLike(pair: string, timeframe: string) {
  return (t: ContextTrade) => ({ pair, timeframe, status: t.status, pnlPercent: t.pnlPercent, createdAt: t.entryTime, closedAt: t.closedAt });
}

async function main() {
  for (const strat of STRATEGIES) {
    console.log(`\n=== ${strat.name} (id ${strat.id}) ===`);
    for (const pair of PAIRS) {
      try {
        const r = await backtestRegimeFilteredStrategy({ strategyId: strat.id, pair, timeframe: strat.timeframe, months: 3 });
        const acceptRate = r.totalSignalsDetected > 0 ? (r.totalAcceptedByRegime / r.totalSignalsDetected) * 100 : 0;

        if (r.acceptedTrades.length < 10) {
          console.log(`${pair}: ${r.totalAcceptedByRegime} aceitos (${acceptRate.toFixed(0)}%) — amostra insuficiente, nem vale rodar holdout`);
          continue;
        }

        const wf = walkForwardSplit(r.acceptedTrades, toTradeLike(pair, strat.timeframe));
        console.log(
          `${pair}: sozinho PF ${r.unfilteredMetrics.profitFactor.toFixed(2)} (n=${r.unfilteredMetrics.totalTrades}) | ` +
          `filtrado agregado PF ${wf.aggregatePF.toFixed(2)} (n=${wf.totalTrades}, ${acceptRate.toFixed(0)}% aceito) | ` +
          `treino PF ${wf.trainPF.toFixed(2)} | teste PF ${wf.testPF.toFixed(2)} | ${wf.passes ? '✅ PASSA holdout' : '❌ reprova holdout'}`
        );
      } catch (e: any) {
        console.log(`${pair}: ERRO — ${e?.message ?? e}`);
      }
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
