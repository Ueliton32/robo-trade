/**
 * Aplica as duas promoções decididas em 12/08/2026, com base no scan de
 * contexto de 100 moedas:
 *
 *   1. Trap de Liquidez (estratégia 3, 1h) → BLESS (71 trades, PF 1,94,
 *      +2,53%) e WLFI (66 trades, PF 1,67, +0,56%). Amostras grandes,
 *      moedas novas na monitoração.
 *
 *   2. Compressão de Volatilidade (estratégia 6, só 1h — foi onde os
 *      resultados bons apareceram) → adicionada em ZEC, BICO e LTC, que
 *      já estavam monitoradas por outras estratégias. Não mexe no que já
 *      tinham configurado, só soma essa estratégia nova.
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/promote-trap-and-squeeze.ts
 */
import { prisma } from '../lib/prisma';

const NEW_PAIRS_TRAP = ['BLESSUSDT', 'WLFIUSDT'];
const TRAP_STRATEGY_ID = 3;

const SQUEEZE_PAIRS = ['ZECUSDT', 'BICOUSDT', 'LTCUSDT'];
const SQUEEZE_STRATEGY_ID = 6;
const SQUEEZE_TIMEFRAME = ['1h'];

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  console.log(`Encontradas ${allSettings.length} configuração(ões) de usuário.`);

  for (const settings of allSettings) {
    const monitoredPairs = Array.from(new Set([...(settings.monitoredPairs ?? []), ...NEW_PAIRS_TRAP, ...SQUEEZE_PAIRS]));
    const pairStrategies = { ...((settings.pairStrategies as Record<string, number[]>) ?? {}) };
    const pairStrategyTimeframes = { ...((settings.pairStrategyTimeframes as Record<string, Record<string, string[]>>) ?? {}) };

    // 1. Trap de Liquidez em BLESS e WLFI (moedas novas, só essa estratégia)
    for (const pair of NEW_PAIRS_TRAP) {
      pairStrategies[pair] = [TRAP_STRATEGY_ID];
    }

    // 2. Compressão de Volatilidade somada em ZEC, BICO, LTC — sem tirar
    // o que já tinham
    for (const pair of SQUEEZE_PAIRS) {
      const current = pairStrategies[pair]?.length ? pairStrategies[pair] : (settings.enabledStrategies ?? [1, 2, 3, 4, 5, 6]);
      pairStrategies[pair] = Array.from(new Set([...current, SQUEEZE_STRATEGY_ID]));
      pairStrategyTimeframes[pair] = {
        ...(pairStrategyTimeframes[pair] ?? {}),
        [String(SQUEEZE_STRATEGY_ID)]: SQUEEZE_TIMEFRAME,
      };
    }

    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { monitoredPairs, pairStrategies, pairStrategyTimeframes },
    });

    console.log(`\nAtualizado usuário ${settings.userId}:`);
    for (const pair of NEW_PAIRS_TRAP) {
      console.log(`  ${pair}: Trap de Liquidez (1h) — moeda nova`);
    }
    for (const pair of SQUEEZE_PAIRS) {
      console.log(`  ${pair}: + Compressão de Volatilidade (1h) — estratégias agora [${pairStrategies[pair].join(',')}]`);
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
