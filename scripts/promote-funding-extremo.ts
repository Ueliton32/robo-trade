/**
 * Promove Funding Extremo (estratégia 4) pra ZEC e WLD, sem filtro de
 * regime (validamos em 11/08/2026 que o filtro piora o resultado dessa
 * combinação — PF 2,48→0,74 no ZEC, PF 8,33→0,74 no WLD).
 *
 * IMPORTANTE: WLD hoje só tinha Rompimento de Range configurado — o
 * Funding Extremo nunca chegou a ser ativado de verdade nele, apesar de
 * validado. Esse script ADICIONA a estratégia 4 sem remover o que já
 * existia (Rompimento de Range continua ativo do jeito que estava).
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/promote-funding-extremo.ts
 */
import { prisma } from '../lib/prisma';

const TARGET_PAIRS = ['WLDUSDT', 'ZECUSDT'];
const STRATEGY_ID = 4;

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  console.log(`Encontradas ${allSettings.length} configuração(ões) de usuário.`);

  for (const settings of allSettings) {
    const monitoredPairs = Array.from(new Set([...(settings.monitoredPairs ?? []), ...TARGET_PAIRS]));
    const pairStrategies = { ...((settings.pairStrategies as Record<string, number[]>) ?? {}) };

    for (const pair of TARGET_PAIRS) {
      const current = pairStrategies[pair]?.length ? pairStrategies[pair] : (settings.enabledStrategies ?? [1, 2, 3, 4, 5, 6]);
      pairStrategies[pair] = Array.from(new Set([...current, STRATEGY_ID]));
    }

    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { monitoredPairs, pairStrategies },
    });

    console.log(`Atualizado usuário ${settings.userId}:`);
    for (const pair of TARGET_PAIRS) {
      console.log(`  ${pair}: estratégias [${pairStrategies[pair].join(',')}] (Funding Extremo sem filtro de regime)`);
    }
  }

  console.log('\nConcluído. Reinicie o scheduler pra aplicar (npm run scheduler).');
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
