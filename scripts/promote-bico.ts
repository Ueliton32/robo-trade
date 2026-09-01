/**
 * Promove Funding Extremo (estratégia 4) pra BICO — descoberta do scan de
 * 100 moedas em 12/08/2026 (PF 2,21, 44 trades, +4,01% de expectativa,
 * a amostra mais robusta entre as descobertas novas daquele scan).
 *
 * Sem filtro de regime, mesma decisão que já tomamos pro Funding Extremo
 * em ZEC e WLD.
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/promote-bico.ts
 */
import { prisma } from '../lib/prisma';

const TARGET_PAIR = 'BICOUSDT';
const STRATEGY_ID = 4;

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  console.log(`Encontradas ${allSettings.length} configuração(ões) de usuário.`);

  for (const settings of allSettings) {
    const monitoredPairs = Array.from(new Set([...(settings.monitoredPairs ?? []), TARGET_PAIR]));
    const pairStrategies = { ...((settings.pairStrategies as Record<string, number[]>) ?? {}) };

    const current = pairStrategies[TARGET_PAIR]?.length ? pairStrategies[TARGET_PAIR] : (settings.enabledStrategies ?? [1, 2, 3, 4, 5, 6]);
    pairStrategies[TARGET_PAIR] = Array.from(new Set([...current, STRATEGY_ID]));

    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { monitoredPairs, pairStrategies },
    });

    console.log(`Atualizado usuário ${settings.userId}: BICOUSDT com estratégias [${pairStrategies[TARGET_PAIR].join(',')}]`);
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
