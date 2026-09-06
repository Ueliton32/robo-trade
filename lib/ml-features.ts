// Vetor de features do modelo ML (Fase 6, 05/09/2026) — fonte ÚNICA de
// verdade, usada tanto por lib/ml-training-data.ts (treino, histórico via
// backtest) quanto por lib/analysis-engine.ts (pontuação ao vivo). Isso é
// proposital: se cada lado calculasse a feature à sua maneira, um
// pequeníssimo desalinhamento (train/serve skew) faria o modelo aprender
// uma coisa no treino e ver outra ao vivo, silenciosamente. Com uma função
// só, os dois sempre calculam exatamente igual.
//
// Só 8 features, todas conhecidas NO MOMENTO do sinal (nada de dado
// futuro) e todas já auditadas em fases anteriores — nada novo sendo
// inventado aqui, só reaproveitado:
//   riskRewardRatio, atrRatio, volumeRatio, regimeForce → já existem em
//   todo Signal desde a Fase 2. confidenceNorm → confiança que a própria
//   estratégia já reporta. trendAligned/lateralizacao/altaVolSemDirecao →
//   derivadas do regime (lib/regime.ts), mesma classificação usada pelo
//   filtro de regime ao vivo (lib/radar-context.ts).
//
// Poucas features simples = mais fácil de explicar e menos propenso a
// overfitting com a quantidade de dado disponível hoje (ver comentário em
// lib/ml-model.ts sobre o tamanho mínimo de amostra exigido pra treinar).
//
// ACHADO (05/09/2026) — leia antes de ativar qualquer modelo treinado com
// este vetor de features: os dois primeiros testes reais (Pullback na
// EMA20, a estratégia mais fraca do projeto, e Reversão após Liquidação,
// a mais forte — `npm run ml:model -- --train`) deram AUC de teste 0.560
// e 0.550 respectivamente. Ambos essencialmente iguais a 0.5 (chute
// aleatório) — ou seja, com o dado e as features de hoje, este vetor NÃO
// mostrou separar WIN de LOSS melhor que o acaso, nem na estratégia fraca
// nem na forte. Não é conclusivo pra sempre (pode mudar com mais dado ao
// vivo acumulado pós-Fase 2, ou com features diferentes), mas por ora
// NENHUM modelo foi ativado — os dois treinos ficaram salvos como
// histórico (MLModel, inativos) só pra auditoria. Antes de tentar de
// novo, vale reconsiderar a hipótese, não só re-treinar com mais dado:
// um candidato levantado mas não testado é que o regime é sempre
// calculado em candles de 1h (REGIME_WINDOW em lib/ml-training-data.ts),
// mesmo pra estratégias mais rápidas (ex: #5 é 5m) — pode estar diluindo
// contexto que só faz sentido num timeframe mais próximo do sinal.
export const FEATURE_NAMES = [
  'riskRewardRatio',
  'atrRatio',
  'volumeRatio',
  'regimeForce',
  'trendAligned',
  'lateralizacao',
  'altaVolatilidadeSemDirecao',
  'confidenceNorm',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export interface FeatureInput {
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  target1: number;
  stopLoss: number;
  confidence: number;
  marketRegime: string | null | undefined;
  regimeForce: number | null | undefined;
  atrRatio: number | null | undefined;
  volumeRatio: number | null | undefined;
}

/**
 * Devolve o vetor de features (mesma ordem de FEATURE_NAMES) ou `null`
 * quando falta contexto de regime — mesma regra em todo lugar: sem
 * regime, não há como pontuar, então não pontua (não inventa valor
 * default pra essas 4 features, que são a maioria do vetor).
 */
export function computeFeatureVector(input: FeatureInput): number[] | null {
  if (
    input.marketRegime == null ||
    input.regimeForce == null ||
    input.atrRatio == null ||
    input.volumeRatio == null
  ) {
    return null;
  }

  const risk = Math.abs(input.entryPrice - input.stopLoss);
  const reward = Math.abs(input.target1 - input.entryPrice);
  const riskRewardRatio = risk > 0 ? reward / risk : 0;

  const trendAligned =
    (input.direction === 'LONG' && (input.marketRegime === 'ALTA' || input.marketRegime === 'ALTA_CORRECAO')) ||
    (input.direction === 'SHORT' && (input.marketRegime === 'BAIXA' || input.marketRegime === 'BAIXA_CORRECAO'))
      ? 1
      : 0;

  return [
    riskRewardRatio,
    input.atrRatio,
    input.volumeRatio,
    input.regimeForce,
    trendAligned,
    input.marketRegime === 'LATERALIZACAO' ? 1 : 0,
    input.marketRegime === 'ALTA_VOLATILIDADE_SEM_DIRECAO' ? 1 : 0,
    Math.max(0, Math.min(1, input.confidence / 100)),
  ];
}
