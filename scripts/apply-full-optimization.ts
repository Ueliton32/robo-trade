/**
 * Aplica de uma vez toda a otimização baseada no scan completo de
 * 06/08/2026 (294 combinações). Substitui o script anterior
 * (apply-scan-recommendations.ts) — não precisa rodar os dois.
 *
 * Resumo das decisões (todas com >= 15 trades de amostra, exceto onde
 * indicado):
 *
 *   BTC, ETH, XRP  → desliga Pullback na EMA20 e Reversão após Liquidação
 *                    (ambas com expectativa negativa nas 3 principais)
 *   SOL            → Pullback só em 1h (PF 1.30); liga Reversão 5m (PF 1.11, marginal)
 *   BNB            → mantém Pullback padrão (PF ~1.0-1.02, os dois timeframes)
 *   ADA            → Pullback só em 4h (PF 2.44)
 *   UNI            → Pullback só em 4h (PF 1.20); Trap de Liquidez em 1h (PF 1.09)
 *   WLD            → desliga Pullback e Trap; Funding Extremo é o forte aqui (PF 3.86)
 *   BCH            → desliga Funding Extremo (PF 0.16, pior do scan); mantém resto
 *   XLM, LTC       → desliga Pullback e Trap, mantém o resto padrão
 *
 * Trap de Liquidez (estratégia 3) fica ligada em 1h só pra UNI (acima).
 * Reversão após Liquidação (estratégia 5) em 5m fica ligada pra:
 *   ADA, UNI, WLD, BNB, BCH, XLM, LTC, SOL
 *
 * Rompimento de Range (estratégia 1) e Compressão de Volatilidade (6) não
 * foram mexidas aqui — a 1 acabou de ter a matemática do alvo corrigida
 * (precisa de scan novo antes de decidir o que cortar) e a 6 quase não
 * dispara ainda (precisa de ajuste de parâmetro antes de avaliar).
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/apply-full-optimization.ts
 */
import { prisma } from '../lib/prisma';

// pair -> lista final de estratégias habilitadas
const FINAL_STRATEGIES: Record<string, number[]> = {
  BTCUSDT: [1, 4, 6],
  ETHUSDT: [1, 4, 6],
  XRPUSDT: [1, 4, 6],
  SOLUSDT: [1, 2, 4, 5, 6],
  BNBUSDT: [1, 2, 4, 5, 6],
  ADAUSDT: [1, 2, 4, 5, 6],
  UNIUSDT: [1, 2, 3, 4, 5, 6],
  WLDUSDT: [1, 4, 5, 6],
  BCHUSDT: [1, 2, 5, 6],
  XLMUSDT: [1, 4, 5, 6],
  LTCUSDT: [1, 4, 5, 6],
};

// pair -> { strategyId: timeframes permitidos }
const FINAL_TIMEFRAMES: Record<string, Record<number, string[]>> = {
  SOLUSDT: { 2: ['1h'], 5: ['5m'] },
  BNBUSDT: { 5: ['5m'] },
  ADAUSDT: { 2: ['4h'], 5: ['5m'] },
  UNIUSDT: { 2: ['4h'], 3: ['1h'], 5: ['5m'] },
  WLDUSDT: { 5: ['5m'] },
  BCHUSDT: { 5: ['5m'] },
  XLMUSDT: { 5: ['5m'] },
  LTCUSDT: { 5: ['5m'] },
};

const ALL_TARGET_PAIRS = Object.keys(FINAL_STRATEGIES);

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  console.log(`Encontradas ${allSettings.length} configuração(ões) de usuário.`);

  for (const settings of allSettings) {
    const monitoredPairs = Array.from(new Set([...(settings.monitoredPairs ?? []), ...ALL_TARGET_PAIRS]));

    const pairStrategies = { ...((settings.pairStrategies as Record<string, number[]>) ?? {}) };
    const pairStrategyTimeframes = { ...((settings.pairStrategyTimeframes as Record<string, Record<string, string[]>>) ?? {}) };

    for (const pair of ALL_TARGET_PAIRS) {
      pairStrategies[pair] = FINAL_STRATEGIES[pair];

      const tfOverride = FINAL_TIMEFRAMES[pair];
      if (tfOverride) {
        const entry: Record<string, string[]> = {};
        for (const [stratId, tfs] of Object.entries(tfOverride)) entry[stratId] = tfs;
        pairStrategyTimeframes[pair] = entry;
      } else {
        delete pairStrategyTimeframes[pair];
      }
    }

    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { monitoredPairs, pairStrategies, pairStrategyTimeframes },
    });

    console.log(`Atualizado usuário ${settings.userId}: ${ALL_TARGET_PAIRS.length} pares reconfigurados.`);
    for (const pair of ALL_TARGET_PAIRS) {
      const tfNote = FINAL_TIMEFRAMES[pair] ? ` (timeframes restritos: ${JSON.stringify(FINAL_TIMEFRAMES[pair])})` : '';
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
