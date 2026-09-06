/**
 * CLI do modelo ML por estratégia (Fase 6). ANTES de treinar/ativar algo
 * novo, leia o comentário "ACHADO (05/09/2026)" no topo de
 * lib/ml-features.ts — os dois primeiros testes reais (estratégia mais
 * fraca e mais forte do projeto) deram AUC ≈ 0.55, sem sinal preditivo
 * real. Nenhum modelo está ativo hoje por causa disso.
 *
 * Treinar NUNCA ativa sozinho
 * (a menos que você passe --activate) — o fluxo normal é treinar, olhar
 * os números, e só então decidir ativar. Isso é de propósito: "não
 * substitua as estratégias atuais antes de avaliar o impacto" também
 * vale pra esse modelo pontuando por cima delas.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/ml-model.ts --list
 *   npx tsx --require dotenv/config scripts/ml-model.ts --train --strategy=2
 *   npx tsx --require dotenv/config scripts/ml-model.ts --train --strategy=2 --months=6 --pairs=ETHUSDT,SOLUSDT,ADAUSDT
 *   npx tsx --require dotenv/config scripts/ml-model.ts --train --strategy=2 --activate
 *   npx tsx --require dotenv/config scripts/ml-model.ts --activate --strategy=2 --version=3
 *   npx tsx --require dotenv/config scripts/ml-model.ts --deactivate --strategy=2
 */
import { prisma } from '../lib/prisma';
import { STRATEGY_DEFS } from '../lib/strategies';
import { trainAndSaveModel, MIN_TRAIN_SAMPLES, MIN_SAMPLES_PER_CLASS } from '../lib/ml-model';

function argValue(name: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function pct(n: number | null): string {
  return n === null ? 'n/d' : `${(n * 100).toFixed(1)}%`;
}

async function cmdList() {
  console.log(`Amostra mínima de treino: ${MIN_TRAIN_SAMPLES} exemplos (>= ${MIN_SAMPLES_PER_CLASS} de cada classe).\n`);
  for (const strat of STRATEGY_DEFS) {
    const versions = await prisma.mLModel.findMany({
      where: { strategyId: strat.id },
      orderBy: { version: 'desc' },
      take: 5,
    });
    console.log('─'.repeat(78));
    console.log(`#${strat.id} ${strat.name}`);
    if (!versions.length) {
      console.log('  Nenhum modelo treinado ainda.');
      continue;
    }
    for (const v of versions) {
      const tag = v.active ? '  ← ATIVO (pontuando sinais ao vivo)' : '';
      console.log(
        `  v${v.version}  treino=${v.trainSampleSize}  teste=${v.testSampleSize}  ` +
        `acurácia teste=${pct(v.testAccuracy)}  AUC teste=${v.testAUC?.toFixed(3) ?? 'n/d'}  ` +
        `Brier=${v.testBrierScore?.toFixed(3) ?? 'n/d'}  baseline (taxa de acerto real)=${pct(v.baselineWinRate)}  ` +
        `(${v.trainedAt.toISOString().slice(0, 10)})${tag}`
      );
    }
  }
  console.log('\nLembrete: AUC 0.5 = não melhor que chute aleatório. Brier menor é melhor (0.25 = sempre prever 50%).');
}

async function cmdTrain() {
  const strategyArg = argValue('strategy');
  if (!strategyArg) {
    console.error('Use --strategy=<id>. IDs válidos: ' + STRATEGY_DEFS.map((s) => s.id).join(', '));
    process.exit(1);
    return;
  }
  const strategyId = parseInt(strategyArg, 10);
  const strat = STRATEGY_DEFS.find((s) => s.id === strategyId);
  if (!strat) {
    console.error(`Estratégia ${strategyArg} não encontrada.`);
    process.exit(1);
    return;
  }

  const monthsArg = argValue('months');
  const months = monthsArg ? parseInt(monthsArg, 10) : 3;
  const pairsArg = argValue('pairs');
  const pairs = pairsArg ? pairsArg.split(',').map((p) => p.trim().toUpperCase()) : undefined;
  const activate = hasFlag('activate');

  console.log(`Treinando modelo pra #${strategyId} ${strat.name} — ${months} mês(es), ${pairs ? pairs.join(', ') : 'todos os pares curados'}.`);
  console.log('Isso busca histórico real da Binance por combinação de par/timeframe — pode levar vários minutos.\n');

  const result = await trainAndSaveModel({
    strategyId,
    months,
    pairs,
    activate,
    onProgress: (msg) => console.log(`  ${msg}`),
  });

  console.log('\n' + '═'.repeat(78));
  if (result.skippedReason) {
    console.log(`  NÃO treinado: ${result.skippedReason}`);
    return;
  }
  console.log(`  Modelo v${result.version} — #${result.strategyId} ${result.strategyName}`);
  console.log('═'.repeat(78));
  console.log(`  Treino: ${result.trainSampleSize} exemplos, acurácia ${pct(result.trainAccuracy)}`);
  console.log(`  Teste (holdout cronológico, nunca visto no treino): ${result.testSampleSize} exemplos`);
  console.log(`    Acurácia: ${pct(result.testAccuracy)}`);
  console.log(`    AUC: ${result.testAUC?.toFixed(3) ?? 'n/d'} (0.5 = chute aleatório, 1.0 = perfeito)`);
  console.log(`    Brier score: ${result.testBrierScore.toFixed(3)} (menor é melhor, 0.25 = sempre prever 50%)`);
  console.log(`  Taxa de acerto real da estratégia no período (baseline): ${pct(result.baselineWinRate)}`);
  if (result.testAUC !== null && result.testAUC < 0.55) {
    console.log('\n  ⚠️  AUC de teste próximo de 0.5 — o modelo não está distinguindo WIN de LOSS melhor que');
    console.log('     o acaso com as features atuais. Salvo mesmo assim (histórico auditável), mas NÃO');
    console.log('     recomendo ativar (--activate) enquanto isso não melhorar.');
  }
  console.log(activate ? '\n  Ativado — passa a pontuar sinais novos dessa estratégia a partir de agora.' : '\n  Salvo como INATIVO — rode com --activate quando decidir usar este modelo ao vivo.');
}

async function cmdActivate() {
  const strategyArg = argValue('strategy');
  const versionArg = argValue('version');
  if (!strategyArg) {
    console.error('Use --activate --strategy=<id> [--version=<n>] (sem --version, ativa a versão mais recente já treinada).');
    process.exit(1);
    return;
  }
  const strategyId = parseInt(strategyArg, 10);

  const target = versionArg
    ? await prisma.mLModel.findFirst({ where: { strategyId, version: parseInt(versionArg, 10) } })
    : await prisma.mLModel.findFirst({ where: { strategyId }, orderBy: { version: 'desc' } });

  if (!target) {
    console.error(`Nenhum modelo encontrado pra estratégia ${strategyId}${versionArg ? ` versão ${versionArg}` : ''}. Rode --train primeiro.`);
    process.exit(1);
    return;
  }

  await prisma.$transaction([
    prisma.mLModel.updateMany({ where: { strategyId, active: true }, data: { active: false } }),
    prisma.mLModel.update({ where: { id: target.id }, data: { active: true } }),
  ]);

  console.log(`Ativado: #${strategyId} ${target.strategyName} v${target.version} — passa a pontuar sinais novos dessa estratégia.`);
}

async function cmdDeactivate() {
  const strategyArg = argValue('strategy');
  if (!strategyArg) {
    console.error('Use --deactivate --strategy=<id>.');
    process.exit(1);
    return;
  }
  const strategyId = parseInt(strategyArg, 10);
  const res = await prisma.mLModel.updateMany({ where: { strategyId, active: true }, data: { active: false } });
  console.log(
    res.count > 0
      ? `Desativado o modelo ativo de #${strategyId} — sinais novos dessa estratégia voltam a sair sem mlProbability.`
      : `Não havia modelo ativo pra #${strategyId} — nada a fazer.`
  );
}

async function main() {
  if (hasFlag('train')) return cmdTrain();
  if (hasFlag('activate')) return cmdActivate();
  if (hasFlag('deactivate')) return cmdDeactivate();
  return cmdList();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[ml-model] Falha:', e?.message ?? e);
    process.exit(1);
  });
