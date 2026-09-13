import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Verificando estratégia 2 nas configurações ===\n');

  const settings = await prisma.userSettings.findMany({
    select: { id: true, pairStrategies: true, enabledStrategies: true }
  });

  for (const s of settings) {
    const hasStrat2 = s.enabledStrategies?.includes(2) ||
      (s.pairStrategies && Object.values(s.pairStrategies).some(arr => arr.includes(2)));

    console.log(`Config ${s.id.slice(0,8)}: enabledStrategies=${JSON.stringify(s.enabledStrategies)}`);
    if (s.pairStrategies) {
      for (const [pair, strats] of Object.entries(s.pairStrategies)) {
        console.log(`  ${pair}: [${strats.join(',')}]`);
        if (strats.includes(2)) {
          console.log(`    ⚠️  Estratégia 2 ainda ativa para ${pair}`);
        }
      }
    }
    console.log(`  Estratégia 2 ativa globalmente? ${hasStrat2 ? 'SIM' : 'NÃO'}`);
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERRO:', e?.message || e);
  process.exit(1);
});
