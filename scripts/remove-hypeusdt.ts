/**
 * Remoção manual do HYPEUSDT da lista de pares monitorados — mesma
 * categoria de decisão que scripts/pause-pullback-ema20.ts (achado
 * negativo confirmado, removido da configuração ao vivo), mas usando o
 * caminho oficial de hoje (lib/config-promotion.ts, Fase 10), que aquele
 * script antigo não tinha disponível ainda quando foi escrito.
 *
 * Achado (08/09/2026): HYPEUSDT com PF líquido 0.38, PnL líquido -14.07%
 * (n=12), ruim nas 3 estratégias que operam nele (Pullback na EMA20,
 * Rompimento de Range, Compressão de Volatilidade) — inclusive Rompimento
 * de Range, que é a melhor estratégia do robô no agregado (PF 3.47 fora
 * do HYPE). Indício de que o problema é o ativo, não a estratégia.
 * Disparou o circuit breaker daily_loss em 08/09 (3 perdas seguidas nele).
 *
 * O que este script faz: remove "HYPEUSDT" de UserSettings.monitoredPairs
 * pra cada usuário que o tiver, via promoteConfigChange() — grava a
 * mudança em ConfigVersion (auditável, reversível por rollbackToVersion).
 * Não apaga pairStrategies["HYPEUSDT"] (fica órfão, inofensivo — sem o
 * par em monitoredPairs, buildPairStrategyPlan nunca chega a olhar pra
 * ele). Não mexe em sinal PENDENTE já aberto em HYPEUSDT (continua sendo
 * monitorado e fechado normalmente).
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/remove-hypeusdt.ts
 */
import { prisma } from '../lib/prisma';
import { ensureBaselineVersion, promoteConfigChange } from '../lib/config-promotion';

const PAIR = 'HYPEUSDT';
const REASON =
  'Removido manualmente em 08/09/2026 — PF líquido 0.38, PnL líquido -14.07% (n=12), ruim nas 3 estratégias que operam nele (Pullback na EMA20, Rompimento de Range, Compressão de Volatilidade), inclusive na melhor estratégia do robô no agregado. Disparou o circuit breaker daily_loss em 08/09 com 3 perdas seguidas nele.';

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  console.log(`Encontradas ${allSettings.length} configuração(ões) de usuário.\n`);

  let affectedUsers = 0;

  for (const settings of allSettings) {
    const pairs = settings.monitoredPairs ?? [];
    if (!pairs.includes(PAIR)) {
      console.log(`Usuário ${settings.userId}: ${PAIR} já não estava em monitoredPairs — nada a fazer.`);
      continue;
    }

    await ensureBaselineVersion(settings.userId);

    const newMonitoredPairs = pairs.filter((p) => p !== PAIR);
    const result = await promoteConfigChange({
      userId: settings.userId,
      newSettings: { monitoredPairs: newMonitoredPairs },
      reason: REASON,
      changedVia: 'remove-hypeusdt-script',
    });

    affectedUsers++;
    console.log(`Usuário ${settings.userId}: ${PAIR} removido de monitoredPairs. Nova versão: ${result.version} (mudou: ${result.changed}).`);
    console.log(`  monitoredPairs agora: ${JSON.stringify(newMonitoredPairs)}`);
  }

  console.log(`\nConcluído. ${affectedUsers} usuário(s) afetado(s).`);
  console.log('Sinais PENDENTE já abertos em HYPEUSDT continuam sendo monitorados e fechados normalmente — isso só afeta geração de sinal NOVO.');
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
