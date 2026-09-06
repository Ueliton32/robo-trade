/**
 * Recalcula e grava uma nova rodada de pesos por estratégia (Fase 7).
 * Não roda sozinho — é sempre uma ação manual, exatamente como
 * `npm run evaluate` (Fase 3) e `npm run risk:reset` (Fase 8).
 *
 * O peso só afeta a ORDEM de prioridade quando o limite de exposição por
 * par (Fase 8) é atingido no mesmo ciclo — nunca leverage, stop, alvo ou
 * limites de risco. Estratégia com amostra insuficiente (< 20 sinais reais
 * fechados na janela) fica neutra (peso 1.0), nunca penalizada por falta
 * de dado.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/recompute-weights.ts
 *   npx tsx --require dotenv/config scripts/recompute-weights.ts --lookback=90
 *   npx tsx --require dotenv/config scripts/recompute-weights.ts --dry-run
 */
import { computeStrategyWeights, recomputeStrategyWeights, WEIGHTS_LOOKBACK_DAYS, WEIGHT_FLOOR, WEIGHT_CEILING } from '../lib/strategy-weights';
import { MIN_SAMPLE_OVERALL } from '../lib/metrics-extended';

function argValue(name: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function pct(n: number | null): string {
  if (n === null) return 'n/d';
  return `${n >= 0 ? '+' : ''}${n.toFixed(3)}%`;
}

async function main() {
  const lookbackArg = argValue('lookback');
  const lookbackDays = lookbackArg ? parseInt(lookbackArg, 10) : WEIGHTS_LOOKBACK_DAYS;
  const dryRun = hasFlag('dry-run');

  console.log(`Janela: últimos ${lookbackDays} dias. Amostra mínima pra sair do peso neutro (1.0): ${MIN_SAMPLE_OVERALL} sinais reais fechados.`);
  console.log(`Faixa de peso: ${WEIGHT_FLOOR.toFixed(1)} (pior desempenho relativo) a ${WEIGHT_CEILING.toFixed(1)} (melhor).`);
  console.log(dryRun ? '(--dry-run: calculando mas NÃO gravando)' : 'Gravando nova rodada de pesos (histórico preservado, nada é sobrescrito)...');

  const results = dryRun
    ? await computeStrategyWeights(lookbackDays)
    : await recomputeStrategyWeights(lookbackDays);

  const sorted = [...results].sort((a, b) => b.weight - a.weight);

  console.log('\n' + '═'.repeat(78));
  console.log('  Pesos por estratégia');
  console.log('═'.repeat(78));
  for (const r of sorted) {
    const tag = r.neutral
      ? (r.sufficientSample ? '(neutro — sem base comparativa)' : `(neutro — amostra insuficiente, n=${r.sampleSize} < ${MIN_SAMPLE_OVERALL})`)
      : `(n=${r.sampleSize})`;
    console.log(
      `  #${String(r.strategyId).padEnd(2)} ${r.strategyName.padEnd(28)} peso=${r.weight.toFixed(3)}  expectância líq=${pct(r.rawExpectancyNet).padStart(10)} ${tag}`
    );
  }
  console.log('\nLembrete: isto NÃO desliga nenhuma estratégia. Se quiser pausar alguma manualmente, use Configurações → Estratégia por Moeda.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[recompute-weights] Falha:', e?.message ?? e);
    process.exit(1);
  });
