import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Verificação pós-mudança: estratégia 2 removida ===\n');

  // 1. Configuração atual
  const settings = await prisma.userSettings.findFirst();
  if (!settings) {
    console.log('ERRO: Nenhuma configuração encontrada');
    process.exit(1);
  }

  console.log(`enabledStrategies: ${JSON.stringify(settings.enabledStrategies)}`);
  console.log(`pairStrategies: ${JSON.stringify(settings.pairStrategies)}`);

  const hasStrat2 = settings.enabledStrategies?.includes(2) ||
    (settings.pairStrategies && Object.values(settings.pairStrategies).some(arr => arr.includes(2)));

  console.log(`\nEstratégia 2 ainda ativa? ${hasStrat2 ? '⚠️  SIM' : '✅ NÃO'}`);

  // 2. ConfigVersion registrado?
  const versions = await prisma.configVersion.findMany({
    where: { userId: settings.userId },
    orderBy: { version: 'desc' },
    take: 3,
    select: { version: true, reason: true, changedVia: true, createdAt: true },
  });

  console.log(`\nConfigVersions (${versions.length} registros):`);
  for (const v of versions) {
    console.log(`  v${v.version} (${v.changedVia}) - ${v.createdAt?.toISOString().slice(0,19)}`);
    console.log(`    ${v.reason?.slice(0, 120)}...`);
  }

  // 3. Win rate atual por estratégia
  console.log('\n=== Win rate atual por estratégia (sem estratégia 2) ===');
  const stratIds = [1, 3, 4, 5, 6];
  for (const id of stratIds) {
    const trades = await prisma.signal.findMany({
      where: { source: 'live', strategyId: id, status: { in: ['WIN', 'LOSS'] } },
      select: { status: true },
    });
    const wins = trades.filter(s => s.status === 'WIN').length;
    const total = trades.length;
    const wr = total > 0 ? (wins / total * 100).toFixed(1) : '0.0';
    console.log(`  Estr ${id}: ${total} trades, ${wins}W, WR=${wr}%`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERRO:', e?.message || e);
  process.exit(1);
});
