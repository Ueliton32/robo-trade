import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Verificação final pós-atualização (09/09/2026) ===\n');

  const settings = await prisma.userSettings.findFirst();
  const versions = await prisma.configVersion.findMany({
    orderBy: { version: 'desc' },
    take: 4,
    select: { version: true, reason: true, createdAt: true, changedVia: true },
  });

  console.log('enabledStrategies:', JSON.stringify(settings?.enabledStrategies));
  console.log('');

  for (const v of versions) {
    console.log(`v${v.version} (${v.changedVia}) — ${v.createdAt?.toISOString().slice(0, 10)}`);
    console.log(`  ${v.reason?.slice(0, 200)}...`);
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERRO:', e?.message || e);
  process.exit(1);
});
