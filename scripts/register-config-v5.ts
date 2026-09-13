import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Registrando mudança de configuração (v5: Reativar estratégia 2 com filtro de regime) ===\n');

  const settings = await prisma.userSettings.findFirst();
  if (!settings) {
    console.log('ERRO: Nenhuma configuração encontrada');
    process.exit(1);
  }

  const lastVersion = await prisma.configVersion.findFirst({
    where: { userId: settings.userId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const newVersion = (lastVersion?.version ?? 0) + 1;

  await prisma.configVersion.create({
    data: {
      userId: settings.userId,
      version: newVersion,
      monitoredPairs: settings.monitoredPairs,
      enabledStrategies: settings.enabledStrategies,
      pairStrategies: settings.pairStrategies ?? Prisma.JsonNull,
      reason: `Reativando estratégia 2 (Pullback EMA20) no enabledStrategies COM filtro de regime ativo. Estratégia 2 (Pullback EMA20) foi removida do enabledStrategies em 08/09/2026 (v4) devido a win rate de 28.2% (78 trades, 22W/56L). Àquela época, o filtro de regime ainda não estava implementado para estratégia 2. Agora, com REGIME_GATED_STRATEGIES_LIVE = [2], os sinais da estratégia 2 só serão gerados em regimes ALTA, BAIXA, ALTA_CORRECAO ou BAIXA_CORRECAO — LATERALIZACAO e ALTA_VOLATILIDADE_SEM_DIRECAO são bloqueados. O objetivo é testar se o filtro de regime melhora o win rate da estratégia 2 de ~28% para algo viável. Se após 2-3 semanas o WR continuar abaixo de 45%, a estratégia será desativada novamente.`,
      changedVia: 'manual',
    },
  });

  console.log(`✅ ConfigVersion ${newVersion} registrada`);
  console.log(`enabledStrategies: ${JSON.stringify(settings.enabledStrategies)}`);
  console.log(`\nFiltro de regime estratégia 2: ALTA, BAIXA, ALTA_CORRECAO, BAIXA_CORRECAO`);
  console.log(`Bloqueados: LATERALIZACAO, ALTA_VOLATILIDADE_SEM_DIRECAO`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERRO:', e?.message || e);
  process.exit(1);
});
