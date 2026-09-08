/**
 * Remove a conta de scaffold "Admin Trader" (abacus-f2ac3d00@example.com),
 * criada automaticamente no momento em que o projeto foi montado
 * (01/09/2026, mesmo timestamp da criação do projeto) — nunca teve login
 * nem sessão (accounts=[], sessions=[]), e-mail de placeholder genérico.
 *
 * Achado (08/09/2026): getGlobalPairStrategyPlan() (lib/pair-strategy-plan.ts)
 * faz UNIÃO das configurações de TODOS os usuários — inclusive essa conta
 * de scaffold, que ainda tinha os padrões amplos de fábrica (todas as 6
 * estratégias em BTC/ETH/SOL/BNB/XRP). Resultado: o robô estava gerando
 * sinal de verdade pra combinações (ex: ETHUSDT + Compressão de
 * Volatilidade) que o usuário real (ueliton32@gmail.com) tinha restringido
 * pra fora do seu próprio pairStrategies — silenciosamente, desde o início.
 * Isso também inflava o efeito do filtro "combinação ainda ativa" recém
 * adicionado aos circuit breakers (max_drawdown/daily_loss/weekly_loss),
 * fazendo alguns re-disparos parecerem "perda nova" quando na verdade
 * incluíam sinal de uma combinação que só existia por causa dessa conta.
 *
 * O que este script faz: apaga o User inteiro (cascade remove
 * UserSettings/Account/Session automaticamente, ver schema.prisma) — não
 * só a UserSettings — pra garantir que nenhum fluxo futuro recrie a
 * poluição. O conteúdo completo é logado ANTES de apagar, pra existir
 * registro caso precise ser reconstruído.
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/cleanup-scaffold-account.ts
 */
import { prisma } from '../lib/prisma';
import { logPilotEvent } from '../lib/pilot-log';

const SCAFFOLD_EMAIL = 'abacus-f2ac3d00@example.com';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: SCAFFOLD_EMAIL },
    include: { settings: true, accounts: true, sessions: true },
  });

  if (!user) {
    console.log(`Nenhum usuário com e-mail ${SCAFFOLD_EMAIL} encontrado — nada a fazer.`);
    return;
  }

  if (user.accounts.length > 0 || user.sessions.length > 0) {
    console.error(
      `ABORTADO: ${SCAFFOLD_EMAIL} tem ${user.accounts.length} conta(s) OAuth e ${user.sessions.length} sessão(ões) — ` +
      `não parece ser scaffold morto. Não vou apagar sem confirmação manual.`
    );
    process.exit(1);
    return;
  }

  const backup = JSON.stringify(user, null, 2);
  console.log('Backup completo antes de apagar:\n', backup);

  await logPilotEvent(
    'MANUAL_PAUSE' as any,
    `Conta de scaffold "${user.name}" (${SCAFFOLD_EMAIL}, id=${user.id}) removida — estava poluindo getGlobalPairStrategyPlan() com padrões amplos de fábrica, causando geração de sinal real em combinações fora do que o usuário real configurou. Nunca teve login/sessão. Backup completo: ${backup}`
  );

  await prisma.user.delete({ where: { id: user.id } });

  console.log(`\nConta ${SCAFFOLD_EMAIL} (id=${user.id}) removida — UserSettings/Account/Session em cascata junto.`);
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
