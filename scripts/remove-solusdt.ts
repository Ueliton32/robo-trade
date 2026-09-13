/**
 * Remoção manual do SOLUSDT da lista de pares monitorados — mesma
 * categoria de decisão que scripts/remove-hypeusdt.ts.
 *
 * Achado (11/09/2026): SOLUSDT com PF líquido 0.28, PnL líquido -38.02%
 * (n=30, todo o histórico), ruim nas 5 estratégias que já operaram nele.
 * Comparação decisiva com as 2 estratégias hoje ativas em SOL:
 *   - Rompimento de Range (a melhor estratégia do robô no agregado):
 *     em SOLUSDT n=9, WR=22%, PF=0.29, PnL líq=-20.01%
 *     nos OUTROS pares n=70, WR=56%, PF=1.70, PnL líq=+78.84%
 *   - Compressão de Volatilidade:
 *     em SOLUSDT n=6, WR=17%, PF=0.14, PnL líq=-12.01%
 *     nos OUTROS pares n=45, WR=49%, PF=1.12, PnL líq=+8.79%
 * Mesma estratégia, resultado oposto — indício de que o problema é o
 * ativo, não a estratégia. SOL foi o principal responsável pelo drawdown
 * que disparou o circuit breaker max_drawdown em 11/09 (73.07%, limite
 * 50%): sozinho, -32.01% líquido na janela de 90 dias, de longe o pior
 * par entre os que ainda rodam ao vivo.
 *
 * O que este script faz: remove "SOLUSDT" de UserSettings.monitoredPairs
 * pra cada usuário que o tiver, via promoteConfigChange() — grava a
 * mudança em ConfigVersion (auditável, reversível por rollbackToVersion).
 * Não apaga pairStrategies["SOLUSDT"] (fica órfão, inofensivo). Não mexe
 * em sinal PENDENTE já aberto em SOLUSDT (continua sendo monitorado e
 * fechado normalmente).
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/remove-solusdt.ts
 */
import { prisma } from '../lib/prisma';
import { ensureBaselineVersion, promoteConfigChange } from '../lib/config-promotion';

const PAIR = 'SOLUSDT';
const REASON =
  'Removido manualmente em 11/09/2026 — PF líquido 0.28, PnL líquido -38.02% (n=30, todo o histórico), ruim nas 5 estratégias que já operaram nele. Nas 2 estratégias hoje ativas em SOL: Rompimento de Range vai -20.01% em SOL contra +78.84% nos outros pares (n=9 vs n=70); Compressão de Volatilidade vai -12.01% em SOL contra +8.79% nos outros pares (n=6 vs n=45). Principal responsável pelo circuit breaker max_drawdown disparado em 11/09 (73.07%, limite 50%) — sozinho, -32.01% líquido na janela de 90 dias.';

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
      changedVia: 'remove-solusdt-script',
    });

    affectedUsers++;
    console.log(`Usuário ${settings.userId}: ${PAIR} removido de monitoredPairs. Nova versão: ${result.version} (mudou: ${result.changed}).`);
    console.log(`  monitoredPairs agora: ${JSON.stringify(newMonitoredPairs)}`);
  }

  console.log(`\nConcluído. ${affectedUsers} usuário(s) afetado(s).`);
  console.log('Sinais PENDENTE já abertos em SOLUSDT continuam sendo monitorados e fechados normalmente — isso só afeta geração de sinal NOVO.');
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
