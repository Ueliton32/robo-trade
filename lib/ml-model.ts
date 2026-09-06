// Orquestração do modelo ML por estratégia (Fase 6, 05/09/2026) — treina,
// persiste (sempre uma linha NOVA, nunca sobrescreve), ativa/desativa, e
// pontua sinais ao vivo com o modelo ativo. Nada aqui roda sozinho: quem
// chama trainAndSaveModel() é sempre scripts/ml-model.ts, disparado
// manualmente pelo usuário — nunca dentro de generateSignals() ou de
// qualquer rota automática.
import { prisma } from './prisma';
import { STRATEGY_DEFS } from './strategies';
import { ROBOT_VERSION } from './version';
import { FEATURE_NAMES, FeatureInput, computeFeatureVector } from './ml-features';
import { generateTrainingExamples, chronoSplit, MLTrainingExample } from './ml-training-data';
import {
  trainLogisticRegression,
  predictProbability,
  evaluateBinaryClassifier,
  StandardizedLogisticModel,
} from './logistic-regression';

// Abaixo disso, nem tenta treinar — amostra pequena demais pra uma
// regressão logística de 8 features não decorar ruído (regra de bolso:
// pelo menos ~10 exemplos por parâmetro, e o modelo tem 9 parâmetros
// incluindo o bias). Isso é sobre o conjunto de TREINO especificamente
// (depois do holdout separar o teste).
export const MIN_TRAIN_SAMPLES = 90;
// Cada classe (WIN e LOSS) precisa de pelo menos isso no treino — sem
// isso, o modelo aprende a sempre prever a classe majoritária e chama
// aquilo de "97% de acerto", o que é enganoso, não bom.
export const MIN_SAMPLES_PER_CLASS = 30;
export const DEFAULT_TEST_FRACTION = 0.3;

export interface TrainModelResult {
  strategyId: number;
  strategyName: string;
  version: number;
  trainSampleSize: number;
  testSampleSize: number;
  trainAccuracy: number;
  testAccuracy: number;
  testAUC: number | null;
  testBrierScore: number;
  baselineWinRate: number;
  skippedReason?: string; // presente quando NÃO treinou (amostra insuficiente)
}

function winRate(examples: MLTrainingExample[]): number {
  if (!examples.length) return 0;
  return examples.filter((e) => e.label === 1).length / examples.length;
}

/**
 * Gera dados de treino via backtest, separa treino/teste cronologicamente,
 * treina, avalia no teste (nunca visto pelo treino) e PERSISTE uma nova
 * versão (sempre inativa por padrão — `activate` precisa ser passado
 * explicitamente pra já entrar em uso ao vivo). Se a amostra for
 * insuficiente, não treina nada e devolve o motivo — não força um modelo
 * ruim só porque foi chamado.
 */
export async function trainAndSaveModel(params: {
  strategyId: number;
  months?: number;
  pairs?: string[];
  testFraction?: number;
  activate?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<TrainModelResult> {
  const strat = STRATEGY_DEFS.find((s) => s.id === params.strategyId);
  if (!strat) throw new Error(`Estratégia ${params.strategyId} não encontrada`);

  const examples = await generateTrainingExamples({
    strategyId: params.strategyId,
    pairs: params.pairs,
    months: params.months,
    onProgress: params.onProgress,
  });

  const testFraction = params.testFraction ?? DEFAULT_TEST_FRACTION;
  const { train, test } = chronoSplit(examples, testFraction);

  const trainWins = train.filter((e) => e.label === 1).length;
  const trainLosses = train.length - trainWins;

  if (train.length < MIN_TRAIN_SAMPLES || trainWins < MIN_SAMPLES_PER_CLASS || trainLosses < MIN_SAMPLES_PER_CLASS) {
    return {
      strategyId: strat.id,
      strategyName: strat.name,
      version: 0,
      trainSampleSize: train.length,
      testSampleSize: test.length,
      trainAccuracy: 0,
      testAccuracy: 0,
      testAUC: null,
      testBrierScore: 0,
      baselineWinRate: winRate(examples),
      skippedReason: `Amostra insuficiente pra treinar com segurança: ${train.length} exemplo(s) de treino (mínimo ${MIN_TRAIN_SAMPLES}), ${trainWins} WIN / ${trainLosses} LOSS (mínimo ${MIN_SAMPLES_PER_CLASS} de cada). Rode com mais meses de histórico (--months) ou mais pares (--pairs), ou aguarde mais sinais reais se preferir treinar com dado ao vivo no futuro.`,
    };
  }

  const X = train.map((e) => e.features);
  const y = train.map((e) => e.label as number);
  const model = trainLogisticRegression(X, y);

  const trainProbs = train.map((e) => predictProbability(e.features, model));
  const trainEval = evaluateBinaryClassifier(trainProbs, y);

  let testAccuracy = 0;
  let testAUC: number | null = null;
  let testBrierScore = 0;
  if (test.length > 0) {
    const testProbs = test.map((e) => predictProbability(e.features, model));
    const testLabels = test.map((e) => e.label as number);
    const testEval = evaluateBinaryClassifier(testProbs, testLabels);
    testAccuracy = testEval.accuracy;
    testAUC = testEval.auc;
    testBrierScore = testEval.brierScore;
  }

  const lastVersion = await prisma.mLModel.findFirst({
    where: { strategyId: strat.id },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const nextVersion = (lastVersion?.version ?? 0) + 1;

  const activate = params.activate ?? false;

  await prisma.$transaction(async (tx) => {
    if (activate) {
      // Nunca fica mais de um modelo ativo por estratégia — desativa
      // qualquer versão anterior antes de ativar a nova.
      await tx.mLModel.updateMany({ where: { strategyId: strat.id, active: true }, data: { active: false } });
    }
    await tx.mLModel.create({
      data: {
        strategyId: strat.id,
        strategyName: strat.name,
        version: nextVersion,
        featureNames: [...FEATURE_NAMES],
        weights: model.weights,
        bias: model.bias,
        featureMeans: model.featureMeans,
        featureStds: model.featureStds,
        trainedFromMonths: params.months ?? 3,
        pairsUsed: params.pairs?.length ? params.pairs : ['(todos os pares curados)'],
        trainSampleSize: train.length,
        testSampleSize: test.length,
        trainAccuracy: trainEval.accuracy,
        testAccuracy,
        testAUC,
        testBrierScore,
        baselineWinRate: winRate(examples),
        active: activate,
        robotVersion: ROBOT_VERSION,
      },
    });
  });

  return {
    strategyId: strat.id,
    strategyName: strat.name,
    version: nextVersion,
    trainSampleSize: train.length,
    testSampleSize: test.length,
    trainAccuracy: trainEval.accuracy,
    testAccuracy,
    testAUC,
    testBrierScore,
    baselineWinRate: winRate(examples),
  };
}

interface ActiveModelRow {
  version: number;
  featureNames: string[];
  weights: number[];
  bias: number;
  featureMeans: number[];
  featureStds: number[];
}

function toStandardizedModel(row: ActiveModelRow): StandardizedLogisticModel {
  return { weights: row.weights, bias: row.bias, featureMeans: row.featureMeans, featureStds: row.featureStds };
}

/**
 * Lê (sem treinar nada) o modelo ativo mais recente de cada estratégia —
 * usado uma vez por ciclo de generateSignals(), igual ao padrão de
 * getLatestStrategyWeights() na Fase 7. Estratégia sem modelo ativo
 * (nunca treinado, ou desativado) fica de fora do mapa — quem chamar
 * trata a ausência como "sem pontuação", nunca como erro.
 */
export async function getActiveModelsByStrategy(): Promise<Map<number, ActiveModelRow>> {
  const rows = await prisma.mLModel.findMany({ where: { active: true } });
  const map = new Map<number, ActiveModelRow>();
  for (const r of rows) {
    map.set(r.strategyId, {
      version: r.version,
      featureNames: r.featureNames as unknown as string[],
      weights: r.weights as unknown as number[],
      bias: r.bias,
      featureMeans: r.featureMeans as unknown as number[],
      featureStds: r.featureStds as unknown as number[],
    });
  }
  return map;
}

/**
 * Pontua um sinal com o modelo ativo da estratégia dele, se houver.
 * Devolve null (nunca um número inventado) quando não há modelo ativo ou
 * quando falta contexto de regime pra montar o vetor de features — em
 * ambos os casos o sinal é salvo normalmente, só sem mlProbability.
 */
export function scoreSignalWithActiveModel(
  activeModels: Map<number, ActiveModelRow>,
  strategyId: number,
  input: FeatureInput
): { probability: number; modelVersion: number } | null {
  const model = activeModels.get(strategyId);
  if (!model) return null;

  const features = computeFeatureVector(input);
  if (!features) return null;

  const probability = predictProbability(features, toStandardizedModel(model));
  return { probability, modelVersion: model.version };
}
