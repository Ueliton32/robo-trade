import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Registrar ConfigVersion 7 (atualização de comentários) ===\n');

  const settings = await prisma.userSettings.findFirst();
  if (!settings) { console.log('Sem configuração'); process.exit(1); }

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
      reason: `Atualização dos comentários em lib/analysis-engine.ts (REGIME_GATED_STRATEGIES_LIVE e REGIME_GATED_STRATEGIES_BY_TF). Reflete as decisões de 08-09/09/2026: estratégia 1 com filtro de regime (RadarContextScan 08/09: PF 0.96 → 1.46 em 1h, filtrar em LATERALIZACAO), estratégia 2 com filtro de regime (RadarContextScan 09/09: PF 0.87 → 1.13 em 1h, PF 0.76 → 0.81 em 4h, PF 0.49 → 0.54 em 15m; melhorou em todos os timeframes). Estratégia 2 reativada pois o filtro de regime melhora suas métricas. REGIME_GATED_STRATEGIES_BY_TF desativado pois as evidências por TF eram inconsistentes. Ver lib/analysis-engine.ts para detalhes.`,
      changedVia: 'manual',
    },
  });

  console.log(`✅ ConfigVersion ${newVersion} registrada\n`);

  // Verificação final
  const allVersions = await prisma.configVersion.findMany({
    orderBy: { version: 'desc' },
    take: 5,
    select: { version: true, reason: true, createdAt: true, changedVia: true },
  });

  console.log('Histórico completo de configurações:\n');
  for (const v of allVersions) {
    console.log(`─── v${v.version} (${v.changedVia}) ───`);
    console.log(`  ${v.createdAt?.toISOString().slice(0, 19)}`);
    console.log(`  ${v.reason?.slice(0, 150)}...`);
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERRO:', e?.message || e);
  process.exit(1);
});