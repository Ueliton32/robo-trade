import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Registrando mudança de configuração (Regime Gate por Timeframe) ===\n');

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
      reason: `Ativação do filtro de regime para estratégia 1 (Rompimento de Range) no timeframe 1h. Baseado no RadarContextScan de 08/09/2026: PF 0.96 → 1.46 (+0.50) em 3 combos com dados suficientes (ETHUSDT, BNBUSDT, AVAXUSDT). O filtro de regime para 15m NÃO foi ativado porque piorou as métricas (PF 0.95 → 0.80). Implementado via REGIME_GATED_STRATEGIES_BY_TF em lib/analysis-engine.ts. Estratégia 2 (Pullback EMA20) continua removida do enabledStrategies.`,
      changedVia: 'manual',
    },
  });

  console.log(`✅ ConfigVersion ${newVersion} registrada`);
  console.log(`enabledStrategies: ${JSON.stringify(settings.enabledStrategies)}`);
  console.log();
  console.log('Regime gate por TF: estratégia 1, somente 1h');
  console.log(`  ✅ 1h: filtro ativado (LATERALIZACAO)`);
  console.log(`  ❌ 15m: sem filtro (o filtro piora as métricas)`);
  console.log(`  ❌ 4h: sem filtro (amostra insuficiente)`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERRO:', e?.message || e);
  process.exit(1);
});
