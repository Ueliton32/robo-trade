import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Reativando estratégia 2 com filtro de regime ===\n');

  const settings = await prisma.userSettings.findFirst();
  if (!settings) { console.log('Sem configuração'); process.exit(1); }

  console.log('enabledStrategies ANTES:', JSON.stringify(settings.enabledStrategies));
  console.log('pairStrategies ANTES:', JSON.stringify(settings.pairStrategies));

  // Reativa estratégia 2 no enabledStrategies
  const newEnabled = [...(settings.enabledStrategies ?? []), 2];
  const updated = await prisma.userSettings.update({
    where: { id: settings.id },
    data: {
      enabledStrategies: newEnabled,
      // Não altera pairStrategies - estratégia 2 vai rodar em todos os pares
      // que não têm override específico
    },
  });

  console.log('\nenabledStrategies DEPOIS:', JSON.stringify(updated.enabledStrategies));
  console.log('\n✅ Estratégia 2 reativada no enabledStrategies');

  // O filtro de regime já está no código (REGIME_GATED_STRATEGIES_LIVE)
  // Próximos sinais da estratégia 2 só serão gerados em:
  //   ALTA, BAIXA, ALTA_CORRECAO, BAIXA_CORRECAO
  console.log('\nFiltro de regime aplicado: só ALTA/BAIXA/ALTA_CORRECAO/BAIXA_CORRECAO');
  console.log('LATERALIZACAO e ALTA_VOLATILIDADE_SEM_DIRECAO bloqueados para estratégia 2');

  await prisma.$disconnect();
}

main().catch(e => { console.error('ERRO:', e?.message || e); process.exit(1); });
