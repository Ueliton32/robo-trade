import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Verificando configuração para ativar filtro de regime estratégia 2 ===\n');

  const settings = await prisma.userSettings.findFirst();
  if (!settings) { console.log('Sem configuração'); process.exit(1); }

  console.log('enabledStrategies atual:', JSON.stringify(settings.enabledStrategies));
  console.log('pairStrategies:', JSON.stringify(settings.pairStrategies));

  // Verifica se estratégia 2 está em enabledStrategies
  const hasStrat2 = settings.enabledStrategies?.includes(2);
  console.log('\nEstratégia 2 no enabledStrategies:', hasStrat2);

  // Verifica se há pairStrategies que incluem 2
  let hasStrat2InPairs = false;
  if (settings.pairStrategies) {
    for (const [pair, strats] of Object.entries(settings.pairStrategies)) {
      if (strats.includes(2)) {
        console.log(`  Estratégia 2 presente em ${pair}: [${strats.join(',')}]`);
        hasStrat2InPairs = true;
      }
    }
  }
  console.log('Estratégia 2 em pairStrategies:', hasStrat2InPairs);

  // Se não estiver habilitada, oferece reativar
  if (!hasStrat2 && !hasStrat2InPairs) {
    console.log('\n⚠️  Estratégia 2 não está habilitada em lugar nenhum.');
    console.log('Para ativar o filtro de regime, primeiro precisa reativar a estratégia.');
    console.log('Receita:');
    console.log('  1. Atualizar enabledStrategies para incluir 2');
    console.log('  2. Re-salvar pairStrategies se necessário');
    console.log('  3. O filtro de regime (REGIME_GATED_STRATEGIES_LIVE) já está no código');
    console.log('\n⚠️  ATENÇÃO: Estratégia 2 tem WR de 28% com 78 trades históricos.');
    console.log('O filtro de regime pode melhorar isso, mas não é garantido.');
    console.log('Recomenda-se: ativar o filtro em PAPER_TRADING primeiro, observar 2-3 semanas,');
    console.log('e só então avaliar se melhora as métricas antes de ir para live.');
  } else {
    console.log('\n✅ Estratégia 2 está habilitada. O código do filtro de regime já está ativo.');
    console.log('Próximos sinais serão gerados só em regimes ALTA/BAIXA/ALTA_CORRECAO/BAIXA_CORRECAO.');
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error('ERRO:', e?.message || e); process.exit(1); });
