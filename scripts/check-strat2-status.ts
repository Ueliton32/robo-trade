import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Verificando estratégia 2 (Pullback EMA20) nas configurações ===\n');

  // 1. Todas as configurações de usuário
  const settings = await prisma.userSettings.findMany({
    select: { id: true, pairStrategies: true, enabledStrategies: true, monitoredPairs: true }
  });

  console.log(`Configurações encontradas: ${settings.length}\n`);

  let anyStrat2Active = false;

  for (const s of settings) {
    const hasStrat2InEnabled = s.enabledStrategies?.includes(2);
    const hasStrat2InPairStrat = s.pairStrategies && Object.values(s.pairStrategies).some(arr => arr.includes(2));
    const hasStrat2 = hasStrat2InEnabled || hasStrat2InPairStrat;

    if (hasStrat2) anyStrat2Active = true;

    console.log(`Config ${s.id.slice(0, 8)}...:`);
    console.log(`  enabledStrategies: ${JSON.stringify(s.enabledStrategies ?? [])}`);
    console.log(`  pairStrategies: ${JSON.stringify(s.pairStrategies ?? {})}`);
    
    if (hasStrat2InEnabled) console.log(`  ⚠️  Estratégia 2 presente em enabledStrategies`);
    if (hasStrat2InPairStrat) {
      const paresCom2 = Object.entries(s.pairStrategies ?? {}).filter(([, arr]) => arr.includes(2)).map(([k]) => k);
      console.log(`  ⚠️  Estratégia 2 presente em pairStrategies para: ${paresCom2.join(', ')}`);
    }
    console.log('');
  }

  // 2. Sinais PENDENTE da estratégia 2
  const pendingStrat2 = await prisma.signal.count({
    where: { source: 'live', strategyId: 2, status: 'PENDENTE' }
  });
  console.log(`Sinais PENDENTE da estratégia 2: ${pendingStrat2}`);

  // 3. Últimos sinais da estratégia 2
  const recentStrat2 = await prisma.signal.findMany({
    where: { source: 'live', strategyId: 2 },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, pair: true, timeframe: true, direction: true, status: true, createdAt: true },
  });
  console.log('\nÚltimos 10 sinais da estratégia 2:');
  for (const s of recentStrat2) {
    console.log(`  ${s.pair} ${s.timeframe} ${s.direction} → ${s.status} | ${s.createdAt?.toISOString().slice(0,10)}`);
  }

  console.log('\n=== RESULTADO ===');
  if (anyStrat2Active) {
    console.log('⚠️  Estratégia 2 AINDA ESTÁ ATIVA em pelo menos uma configuração.');
    console.log('Ação necessária: remover estratégia 2 de todas as configurações.');
  } else {
    console.log('✅ Estratégia 2 NÃO está mais ativa em nenhuma configuração.');
    console.log('O problema de win rate 43% é outro — não é estratégia 2 contaminando.');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('ERRO:', e?.message || e); process.exit(1); });
