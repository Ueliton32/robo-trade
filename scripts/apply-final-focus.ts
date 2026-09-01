/**
 * Foco final: reduz a configuração pra rodar SÓ as 11 combinações de
 * alta confiança do scan de 06/08/2026, mais Funding Extremo em ZEC
 * (adicionado por pedido direto, fora do ranking).
 *
 * Diferente dos scripts anteriores, este SUBSTITUI a configuração de cada
 * par pela lista final — não mescla com o que existia antes. BTC, BNB e
 * XLM saem completamente dos pares monitorados (nenhuma das 11
 * combinações os envolve).
 *
 * As 11 combinações:
 *   WLD  → Rompimento de Range (15m)                    PF 1.41, 164 trades
 *   BCH  → Rompimento de Range (15m + 1h)                PF 1.26 / 1.33
 *   SOL  → Pullback na EMA20 (1h)                        PF 1.30, 202 trades
 *   ADA  → Rompimento de Range (15m + 1h)                PF 1.18 / 1.24
 *   ADA  → Pullback na EMA20 (4h)                        PF 2.44
 *   ETH  → Rompimento de Range (1h)                      PF 1.53
 *   XRP  → Rompimento de Range (1h)                      PF 1.29
 *   LTC  → Rompimento de Range (1h)                      PF 1.58
 *   UNI  → Reversão após Liquidação (5m)                 PF 1.81
 *   + ZEC → Funding Extremo (1h)                          PF 2.05 (adicionado por pedido)
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/apply-final-focus.ts
 */
import { prisma } from '../lib/prisma';

const REMOVE_PAIRS = ['BTCUSDT', 'BNBUSDT', 'XLMUSDT'];

// Config final — substitui totalmente o que existia pra cada um desses pares.
const FINAL_STRATEGIES: Record<string, number[]> = {
  WLDUSDT: [1],
  BCHUSDT: [1],
  SOLUSDT: [2],
  ADAUSDT: [1, 2],
  ETHUSDT: [1],
  XRPUSDT: [1],
  LTCUSDT: [1],
  UNIUSDT: [5],
  ZECUSDT: [4],
};

const FINAL_TIMEFRAMES: Record<string, Record<string, string[]>> = {
  WLDUSDT: { '1': ['15m'] },
  BCHUSDT: { '1': ['15m', '1h'] },
  SOLUSDT: { '2': ['1h'] },
  ADAUSDT: { '1': ['15m', '1h'], '2': ['4h'] },
  ETHUSDT: { '1': ['1h'] },
  XRPUSDT: { '1': ['1h'] },
  LTCUSDT: { '1': ['1h'] },
  UNIUSDT: { '5': ['5m'] },
  // ZECUSDT: Funding Extremo só tem 1h mesmo, não precisa restringir.
};

const FINAL_PAIRS = Object.keys(FINAL_STRATEGIES);

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  console.log(`Encontradas ${allSettings.length} configuração(ões) de usuário.`);

  for (const settings of allSettings) {
    // Pares monitorados: remove os 3 excluídos, garante os 9 finais.
    const currentPairs = (settings.monitoredPairs ?? []).filter((p: string) => !REMOVE_PAIRS.includes(p));
    const monitoredPairs = Array.from(new Set([...currentPairs, ...FINAL_PAIRS]));

    const pairStrategies = { ...((settings.pairStrategies as Record<string, number[]>) ?? {}) };
    const pairStrategyTimeframes = { ...((settings.pairStrategyTimeframes as Record<string, Record<string, string[]>>) ?? {}) };

    // Limpa configuração dos pares removidos (não fazem mais parte de nada).
    for (const pair of REMOVE_PAIRS) {
      delete pairStrategies[pair];
      delete pairStrategyTimeframes[pair];
    }

    // Substitui (não mescla) a config dos 9 pares do foco final.
    for (const pair of FINAL_PAIRS) {
      pairStrategies[pair] = FINAL_STRATEGIES[pair];
      if (FINAL_TIMEFRAMES[pair]) {
        pairStrategyTimeframes[pair] = FINAL_TIMEFRAMES[pair];
      } else {
        delete pairStrategyTimeframes[pair];
      }
    }

    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { monitoredPairs, pairStrategies, pairStrategyTimeframes },
    });

    console.log(`\nAtualizado usuário ${settings.userId}:`);
    console.log(`  Removidos: ${REMOVE_PAIRS.join(', ')}`);
    for (const pair of FINAL_PAIRS) {
      const tfNote = FINAL_TIMEFRAMES[pair] ? ` (${JSON.stringify(FINAL_TIMEFRAMES[pair])})` : '';
      console.log(`  ${pair}: estratégias [${FINAL_STRATEGIES[pair].join(',')}]${tfNote}`);
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
