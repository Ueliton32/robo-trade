// Regressão logística simples, em TypeScript puro, sem dependência
// externa (Fase 6, 05/09/2026) — deliberadamente o modelo mais simples
// possível que ainda dá uma probabilidade calibrável: cada feature tem UM
// coeficiente, então dá pra olhar os pesos e explicar "isso pesou a favor,
// isso pesou contra" sem caixa-preta nenhuma. Nada de árvore, ensemble ou
// rede neural — o pedido original foi explícito sobre isso.
//
// Padronização (z-score) é parte do modelo treinado (featureMeans/
// featureStds ficam salvos junto dos pesos), não um passo solto — assim
// dá pra pontuar um sinal novo aplicando exatamente a mesma transformação
// usada no treino, sem precisar recalcular médias/desvios toda hora.

export interface StandardizedLogisticModel {
  weights: number[];
  bias: number;
  featureMeans: number[];
  featureStds: number[];
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function standardize(X: number[][]): { Z: number[][]; means: number[]; stds: number[] } {
  const n = X.length;
  const d = X[0]?.length ?? 0;
  const means = new Array(d).fill(0);
  const stds = new Array(d).fill(1);

  for (let j = 0; j < d; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += X[i][j];
    means[j] = n > 0 ? sum / n : 0;
  }
  for (let j = 0; j < d; j++) {
    let sq = 0;
    for (let i = 0; i < n; i++) sq += (X[i][j] - means[j]) ** 2;
    // Feature constante (desvio 0) usaria divisão por zero — trata como
    // desvio 1 (o z-score vira sempre 0, a feature efetivamente não pesa
    // nada, em vez de virar NaN e quebrar o treino inteiro).
    stds[j] = n > 0 ? Math.sqrt(sq / n) || 1 : 1;
  }

  const Z = X.map((row) => row.map((v, j) => (v - means[j]) / stds[j]));
  return { Z, means, stds };
}

/**
 * Treina por gradiente descendente em lote (full-batch), com
 * regularização L2 (ridge) — penaliza pesos grandes, reduz a chance de o
 * modelo "decorar" ruído de uma amostra pequena em vez de aprender um
 * padrão real. Épocas e taxa de aprendizado fixas e conservadoras (não
 * são ajustadas por busca automática — isso seria mais uma superfície de
 * overfitting, não menos).
 */
export function trainLogisticRegression(
  X: number[][],
  y: number[],
  opts: { epochs?: number; learningRate?: number; l2?: number } = {}
): StandardizedLogisticModel {
  const epochs = opts.epochs ?? 500;
  const lr = opts.learningRate ?? 0.3;
  const l2 = opts.l2 ?? 0.02;

  const { Z, means, stds } = standardize(X);
  const n = Z.length;
  const d = Z[0]?.length ?? 0;
  const weights = new Array(d).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;

    for (let i = 0; i < n; i++) {
      let z = bias;
      for (let j = 0; j < d; j++) z += Z[i][j] * weights[j];
      const pred = sigmoid(z);
      const err = pred - y[i];
      for (let j = 0; j < d; j++) gradW[j] += err * Z[i][j];
      gradB += err;
    }

    for (let j = 0; j < d; j++) {
      weights[j] -= lr * (gradW[j] / n + l2 * weights[j]);
    }
    bias -= lr * (gradB / n);
  }

  return { weights, bias, featureMeans: means, featureStds: stds };
}

/**
 * Aplica a MESMA padronização do treino (featureMeans/featureStds
 * salvos) antes de pontuar — nunca recalcula média/desvio em cima do
 * dado novo, senão o mesmo sinal pontuaria diferente dependendo de que
 * outros sinais vieram junto.
 */
export function predictProbability(features: number[], model: StandardizedLogisticModel): number {
  let z = model.bias;
  for (let j = 0; j < features.length; j++) {
    const zscore = (features[j] - model.featureMeans[j]) / (model.featureStds[j] || 1);
    z += zscore * model.weights[j];
  }
  return sigmoid(z);
}

export interface ClassifierEvaluation {
  accuracy: number;
  auc: number | null; // null se só uma classe presente no conjunto de teste
  brierScore: number; // menor é melhor; 0.25 = equivalente a sempre prever 50%
}

/**
 * Avalia num conjunto de teste que o treino NUNCA viu (holdout
 * cronológico — ver lib/ml-training-data.ts). AUC calculado por
 * contagem de pares concordantes (Mann-Whitney), sem depender de
 * biblioteca externa — custo O(positivos × negativos), tranquilo pro
 * tamanho de amostra que um treino manual deste projeto produz.
 */
export function evaluateBinaryClassifier(probs: number[], labels: number[]): ClassifierEvaluation {
  const n = probs.length;
  let correct = 0;
  let brierSum = 0;
  for (let i = 0; i < n; i++) {
    const predicted = probs[i] >= 0.5 ? 1 : 0;
    if (predicted === labels[i]) correct++;
    brierSum += (probs[i] - labels[i]) ** 2;
  }

  const positives = probs.filter((_, i) => labels[i] === 1);
  const negatives = probs.filter((_, i) => labels[i] === 0);

  let auc: number | null = null;
  if (positives.length > 0 && negatives.length > 0) {
    let concordant = 0;
    let tied = 0;
    for (const p of positives) {
      for (const q of negatives) {
        if (p > q) concordant++;
        else if (p === q) tied++;
      }
    }
    auc = (concordant + 0.5 * tied) / (positives.length * negatives.length);
  }

  return {
    accuracy: n > 0 ? correct / n : 0,
    auc,
    brierScore: n > 0 ? brierSum / n : 0,
  };
}
