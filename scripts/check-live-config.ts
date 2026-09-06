/**
 * Diagnóstico rápido: mostra exatamente o que está configurado pra cada
 * par monitorado agora, sem precisar esperar o agendador rodar um ciclo
 * nem adivinhar se algo foi aplicado corretamente.
 *
 * Rode a qualquer momento:
 *   npx tsx --require dotenv/config scripts/check-live-config.ts
 */
import { prisma } from '../lib/prisma';
import { getGlobalPairStrategyPlan } from '../lib/analysis-engine';
import { getFundingRate } from '../lib/binance';
import { getConfiguredExecutionMode } from '../lib/execution-mode';

const STRATEGY_NAMES: Record<number, string> = {
  1: 'Rompimento de Range', 2: 'Pullback na EMA20', 3: 'Trap de Liquidez',
  4: 'Funding Extremo', 5: 'Reversão após Liquidação', 6: 'Compressão de Volatilidade',
};

const FUNDING_EXTREME_POS = 0.001;
const FUNDING_EXTREME_NEG = -0.0005;

async function main() {
  const plan = await getGlobalPairStrategyPlan();
  const pairs = Object.keys(plan).sort();

  console.log(`\n=== Modo de execução (Fase 9): ${getConfiguredExecutionMode()} ===`);
  console.log(`\n=== Configuração ao vivo agora (${pairs.length} pares) ===\n`);
  for (const pair of pairs) {
    console.log(pair);
    for (const [id, tfs] of Object.entries(plan[pair])) {
      console.log(`  - ${STRATEGY_NAMES[Number(id)] ?? id}: ${tfs.join(', ')}`);
    }
  }

  console.log(`\n=== Sinais reais já registrados por par (todos os tempos) ===\n`);
  for (const pair of pairs) {
    const total = await prisma.signal.count({ where: { pair, source: 'live' } });
    const last = await prisma.signal.findFirst({
      where: { pair, source: 'live' },
      orderBy: { createdAt: 'desc' },
    });
    const lastInfo = last ? `último em ${last.createdAt.toISOString()} (${last.status})` : 'nenhum ainda';
    console.log(`${pair}: ${total} sinal(is) — ${lastInfo}`);
  }

  console.log(`\n=== Funding rate atual vs limiar (só pares com Funding Extremo ativo) ===\n`);
  for (const pair of pairs) {
    if (!plan[pair]?.[4]) continue; // estratégia 4 = Funding Extremo
    const funding = await getFundingRate(pair);
    if (!funding) {
      console.log(`${pair}: n\u00e3o consegui buscar o funding agora`);
      continue;
    }
    const rate = parseFloat(funding.fundingRate ?? '0');
    const pctPos = (rate / FUNDING_EXTREME_POS) * 100;
    const pctNeg = (rate / FUNDING_EXTREME_NEG) * 100;
    const status = rate > FUNDING_EXTREME_POS ? 'EXTREMO POSITIVO — deveria estar disparando'
      : rate < FUNDING_EXTREME_NEG ? 'EXTREMO NEGATIVO — deveria estar disparando'
      : 'dentro do normal, n\u00e3o dispara';
    console.log(`${pair}: funding atual = ${(rate * 100).toFixed(4)}% (limiar positivo: ${(FUNDING_EXTREME_POS * 100).toFixed(2)}%, negativo: ${(FUNDING_EXTREME_NEG * 100).toFixed(2)}%) \u2014 ${status}`);
    if (rate > 0) console.log(`   ${pctPos.toFixed(0)}% do caminho at\u00e9 o limiar positivo`);
    else console.log(`   ${Math.abs(pctNeg).toFixed(0)}% do caminho at\u00e9 o limiar negativo`);
  }

  console.log('');
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
