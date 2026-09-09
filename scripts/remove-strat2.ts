import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Removendo estratégia 2 do enabledStrategies ===\n');

  const settings = await prisma.userSettings.findFirst();
  if (!settings) {
    console.log('NENHUMA configuração encontrada');
    process.exit(1);
  }

  console.log(`Configuração: ${settings.id.slice(0, 8)}...`);
  console.log(`enabledStrategies ANTES: ${JSON.stringify(settings.enabledStrategies)}`);

  // Remove estratégia 2
  const newEnabled = (settings.enabledStrategies ?? []).filter(id => id !== 2);
  const updated = await prisma.userSettings.update({
    where: { id: settings.id },
    data: { enabledStrategies: newEnabled },
  });

  console.log(`enabledStrategies DEPOIS: ${JSON.stringify(updated.enabledStrategies)}`);
  console.log('\n✅ Estratégia 2 removida do enabledStrategies');

  // Verifica sinais PENDENTE da estratégia 2 que poderiam ser gerados
  const pendingStrat2 = await prisma.signal.count({
    where: { source: 'live', strategyId: 2, status: 'PENDENTE' }
  });
  console.log(`Sinais PENDENTE da estratégia 2 (já existentes): ${pendingStrat2}`);

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERRO:', e?.message || e);
  process.exit(1);
});
