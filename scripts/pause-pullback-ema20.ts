/**
 * Pausa manual da estratégia "Pullback na EMA20" (id 2) — resolução do
 * achado negativo confirmado independentemente três vezes: avaliação
 * líquida (Fase 3, scripts/evaluate.ts), holdout formal por moeda
 * (stability-check em ETH/SOL/ADA) e, mais recentemente, expectância
 * líquida negativa (-0,263%, n>=20) no cálculo de peso da Fase 7. A
 * checagem ao vivo (05/09/2026) mostrou a estratégia rodando em 12 pares
 * (ADA, AVAX, BCH, BNB, BTC, DOT, ETH, HYPE, LINK, SOL, SUI, XRP) — bem
 * além dos 3 originalmente validados (ETH/SOL/ADA), sem nenhuma evidência
 * própria de que os outros 9 estejam indo melhor.
 *
 * O que este script faz: pra cada par que hoje tem a estratégia 2 ativa
 * (via UserSettings.pairStrategies ou o default enabledStrategies),
 * grava um override explícito em pairStrategies removendo só o id 2 —
 * as outras estratégias daquele par continuam exatamente como estavam.
 *
 * O que NÃO faz: não mexe em sinal PENDENTE já aberto (continuam sendo
 * monitorados e fechados normalmente, como qualquer outro); não apaga
 * histórico nem estatística nenhuma; não é reversível só reexecutando —
 * pra reativar, edite pairStrategies manualmente ou pela tela de
 * Configurações → Estratégia por Moeda.
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/pause-pullback-ema20.ts
 */
import { prisma } from '../lib/prisma';
import { logPilotEvent } from '../lib/pilot-log';

const STRATEGY_ID = 2;
const STRATEGY_NAME = 'Pullback na EMA20';
const REASON =
  'Pausada manualmente em 05/09/2026 — expectância líquida negativa (-0,263%, amostra suficiente) confirmada de forma independente em 3 análises (Fase 3, stability-check, Fase 7).';

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  console.log(`Encontradas ${allSettings.length} configuração(ões) de usuário.\n`);

  let totalPairsAffected = 0;

  for (const settings of allSettings) {
    const pairs = settings.monitoredPairs ?? [];
    const defaultStrats = settings.enabledStrategies?.length ? settings.enabledStrategies : [1, 2, 3, 4, 5, 6];
    const pairStrategies = { ...((settings.pairStrategies as Record<string, number[]>) ?? {}) };

    const affectedPairs: string[] = [];

    for (const pair of pairs) {
      const current = pairStrategies[pair]?.length ? pairStrategies[pair] : defaultStrats;
      if (!current.includes(STRATEGY_ID)) continue; // já não tem — nada a fazer

      pairStrategies[pair] = current.filter((id) => id !== STRATEGY_ID);
      affectedPairs.push(pair);
    }

    if (!affectedPairs.length) {
      console.log(`Usuário ${settings.userId}: Pullback na EMA20 já não estava ativa em nenhum par monitorado — nada a fazer.`);
      continue;
    }

    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { pairStrategies },
    });

    for (const pair of affectedPairs) {
      await logPilotEvent('MANUAL_PAUSE', REASON, { strategyId: STRATEGY_ID, pair });
    }

    totalPairsAffected += affectedPairs.length;
    console.log(`Usuário ${settings.userId}: Pullback na EMA20 pausada em ${affectedPairs.length} par(es): ${affectedPairs.join(', ')}`);
  }

  console.log(`\nConcluído. ${totalPairsAffected} par(es) afetado(s) no total.`);
  console.log('Sinais PENDENTE já abertos dessa estratégia continuam sendo monitorados e fechados normalmente — isso só para geração de sinal NOVO.');
  console.log('Reinicie o scheduler pra aplicar (npm run scheduler), se estiver rodando como processo contínuo.');
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
