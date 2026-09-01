/**
 * Segunda rodada de otimização — agora com o Rompimento de Range (após a
 * correção do payoff em 06/08/2026). Roda DEPOIS de
 * apply-full-optimization.ts — não substitui, complementa (mescla com o
 * que já existe, não apaga a configuração das outras estratégias).
 *
 * Decisões pro Rompimento de Range (estratégia 1), com >= 15 trades de
 * amostra pós-correção:
 *
 *   BTC, BNB, XLM, UNI  → desliga (PF 0,65-0,99, fracas ou só empatando)
 *   ETH                 → mantém só 1h (PF 1,53)
 *   XRP                 → mantém só 1h (PF 1,29)
 *   LTC                 → mantém só 1h (PF 1,58)
 *   WLD                 → mantém só 15m (PF 1,41)
 *   BCH                 → mantém 15m e 1h (PF 1,26 e 1,33, as duas boas)
 *   SOL                 → mantém só 1h (PF 1,05, marginal mas positivo)
 *   ADA                 → sem mudança (já positiva nos dois timeframes)
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/apply-optimization-round2.ts
 */
import { prisma } from '../lib/prisma';

const RANGE_STRATEGY_ID = 1;

const DISABLE_RANGE = ['BTCUSDT', 'BNBUSDT', 'XLMUSDT', 'UNIUSDT'];

const RESTRICT_RANGE_TIMEFRAME: Record<string, string[]> = {
  ETHUSDT: ['1h'],
  XRPUSDT: ['1h'],
  LTCUSDT: ['1h'],
  WLDUSDT: ['15m'],
  BCHUSDT: ['15m', '1h'],
  SOLUSDT: ['1h'],
};
// ADAUSDT: sem mudança — já positiva nos dois timeframes, fica sem restrição.

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  console.log(`Encontradas ${allSettings.length} configuração(ões) de usuário.`);

  for (const settings of allSettings) {
    const pairStrategies = { ...((settings.pairStrategies as Record<string, number[]>) ?? {}) };
    const pairStrategyTimeframes = { ...((settings.pairStrategyTimeframes as Record<string, Record<string, string[]>>) ?? {}) };

    for (const pair of DISABLE_RANGE) {
      const current = pairStrategies[pair] ?? (settings.enabledStrategies ?? [1, 2, 3, 4, 5, 6]);
      pairStrategies[pair] = current.filter((id: number) => id !== RANGE_STRATEGY_ID);
    }

    for (const [pair, tfs] of Object.entries(RESTRICT_RANGE_TIMEFRAME)) {
      pairStrategyTimeframes[pair] = {
        ...(pairStrategyTimeframes[pair] ?? {}),
        [String(RANGE_STRATEGY_ID)]: tfs,
      };
    }

    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { pairStrategies, pairStrategyTimeframes },
    });

    console.log(`Atualizado usuário ${settings.userId}.`);
    console.log(`  Rompimento de Range desligado em: ${DISABLE_RANGE.join(', ')}`);
    for (const [pair, tfs] of Object.entries(RESTRICT_RANGE_TIMEFRAME)) {
      console.log(`  ${pair}: Rompimento de Range restrito a ${tfs.join(', ')}`);
    }
    console.log(`  ADAUSDT: sem mudança (mantido sem restrição)`);
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
