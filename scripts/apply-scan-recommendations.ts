/**
 * Aplica a recomendação do scan de 06/08/2026: liga "Reversão após
 * Liquidação" SÓ no timeframe de 5m (não 15m, que ficou fraco pra essas
 * mesmas moedas) nas 7 moedas que mostraram profit factor consistente:
 * ADA, UNI, WLD, BNB, BCH, XLM, LTC.
 *
 * Não desliga nem restringe nada que já estava configurado — só adiciona
 * essa estratégia+timeframe às moedas alvo, e garante que elas estejam
 * na lista de pares monitorados.
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/apply-scan-recommendations.ts
 */
import { prisma } from '../lib/prisma';

const TARGET_PAIRS = ['ADAUSDT', 'UNIUSDT', 'WLDUSDT', 'BNBUSDT', 'BCHUSDT', 'XLMUSDT', 'LTCUSDT'];
const STRATEGY_ID = 5; // Reversão após Liquidação
const ALLOWED_TIMEFRAMES = ['5m'];

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  console.log(`Encontradas ${allSettings.length} configuração(ões) de usuário.`);

  for (const settings of allSettings) {
    const monitoredPairs = Array.from(new Set([...(settings.monitoredPairs ?? []), ...TARGET_PAIRS]));

    const pairStrategies = { ...((settings.pairStrategies as Record<string, number[]>) ?? {}) };
    const pairStrategyTimeframes = { ...((settings.pairStrategyTimeframes as Record<string, Record<string, string[]>>) ?? {}) };

    for (const pair of TARGET_PAIRS) {
      const currentStrats = pairStrategies[pair]?.length ? pairStrategies[pair] : (settings.enabledStrategies ?? [1, 2, 3, 4, 5, 6]);
      pairStrategies[pair] = Array.from(new Set([...currentStrats, STRATEGY_ID]));

      pairStrategyTimeframes[pair] = {
        ...(pairStrategyTimeframes[pair] ?? {}),
        [String(STRATEGY_ID)]: ALLOWED_TIMEFRAMES,
      };
    }

    await prisma.userSettings.update({
      where: { id: settings.id },
      data: {
        monitoredPairs,
        pairStrategies,
        pairStrategyTimeframes,
      },
    });

    console.log(`Atualizado usuário ${settings.userId}: ${TARGET_PAIRS.join(', ')} agora rodam Reversão após Liquidação só em 5m.`);
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
