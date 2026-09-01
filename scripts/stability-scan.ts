/**
 * Roda a checagem de estabilidade (lib/stability-engine.ts) pra TODAS as
 * combinações que estão ao vivo agora — o mesmo plano que o agendador usa
 * de verdade (getGlobalPairStrategyPlan) — uma a uma, persiste cada
 * resultado em StabilityScan (histórico consultável) e imprime um resumo
 * ordenado por gravidade no final.
 *
 * Isso também roda sozinho 1x/semana via scripts/scheduler.ts
 * (runWeeklyStabilityScanIfDue) — este script é a versão manual/sob
 * demanda, sem esperar o agendador ou o throttle semanal.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/stability-scan.ts [--months=3] [--splits=2]
 */
import { getGlobalPairStrategyPlan } from '../lib/analysis-engine';
import { computeStability, persistStabilityResult, StabilityResult, StabilityVerdict } from '../lib/stability-engine';
import { prisma } from '../lib/prisma';

function argValue(name: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
}

const MONTHS = Math.max(1, parseInt(argValue('months') ?? '3', 10) || 3);
const SPLITS = Math.max(2, parseInt(argValue('splits') ?? '2', 10) || 2);
const DELAY_BETWEEN_COMBOS_MS = 300;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const plan = await getGlobalPairStrategyPlan();
  const combos: { pair: string; strategyId: number; timeframe: string }[] = [];
  for (const [pair, strategies] of Object.entries(plan)) {
    for (const [sidStr, tfs] of Object.entries(strategies)) {
      for (const tf of tfs) combos.push({ pair, strategyId: Number(sidStr), timeframe: tf });
    }
  }

  console.log(`${combos.length} combinação(ões) ao vivo agora. Rodando ${MONTHS} ${MONTHS === 1 ? 'mês' : 'meses'}, ${SPLITS} pedaço(s) cada.\n`);

  const results: StabilityResult[] = [];

  for (let i = 0; i < combos.length; i++) {
    const { pair, strategyId, timeframe } = combos[i];
    const label = `[${i + 1}/${combos.length}] ${pair} × estratégia ${strategyId} × ${timeframe}`;

    try {
      const r = await computeStability({ strategyId, pair, timeframe, months: MONTHS, splits: SPLITS });
      results.push(r);
      await persistStabilityResult(r, MONTHS, SPLITS);
      console.log(`${label} → ${r.totalTrades} trades, PF geral ${r.overallPF.toFixed(2)}, pedaços [${r.bucketPFs.map((p) => p.toFixed(2)).join(', ')}] → ${r.verdict}`);
    } catch (e: any) {
      console.log(`${label} → ERRO: ${e?.message ?? e}`);
    }

    await sleep(DELAY_BETWEEN_COMBOS_MS);
  }

  const order: Record<StabilityVerdict, number> = { INSTAVEL: 0, ALTA_VARIANCIA: 1, AMOSTRA_INSUFICIENTE: 2, ESTAVEL: 3 };
  results.sort((a, b) => order[a.verdict] - order[b.verdict]);

  console.log('\n── Resumo (ordenado por gravidade) ──');
  for (const r of results) {
    console.log(
      `${r.verdict.padEnd(20)} ${r.pair.padEnd(12)} ${r.strategyName.padEnd(28)} ${r.timeframe.padEnd(4)} ` +
      `${r.totalTrades} trades  PF geral ${r.overallPF.toFixed(2)}  pedaços [${r.bucketPFs.map((p) => p.toFixed(2)).join(', ')}]`
    );
  }

  const unstable = results.filter((r) => r.verdict === 'INSTAVEL' || r.verdict === 'ALTA_VARIANCIA').length;
  console.log(`\n${unstable} de ${results.length} combinação(ões) com sinal de instabilidade. Resultado salvo em StabilityScan.`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[stability-scan] Falha:', e?.message ?? e);
  process.exit(1);
});
