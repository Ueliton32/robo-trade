// Holdout formal — divide cronologicamente um conjunto de trades em
// "treino" (primeira metade) e "teste" (segunda metade, nunca usada pra
// decidir) e só considera validado se as DUAS metades ficarem com PF
// >= 1.0, não só a média do período inteiro.
//
// Existe porque o PF agregado esconde inconsistência: uma combinação pode
// parecer boa na média só porque uma metade compensa a outra. Achado real
// em 03/09/2026 — AVAXUSDT/BCHUSDT/DOTUSDT × Pullback na EMA20 × 1h
// pareciam validados pelo PF agregado filtrado (0.85→1.18, 0.87→1.04,
// 0.77→1.14), mas reprovaram aqui (treino/teste indo em direções opostas
// em todos os 3) — a promoção foi revertida na hora. A partir de agora,
// ESTE é o critério de promoção pra qualquer filtro ou estratégia nova,
// não só o agregado que scripts/experiment-*.ts e lib/radar-context-backtest.ts
// reportavam antes.
import { computeMetrics, TradeLike } from './metrics';

export interface WalkForwardResult {
  totalTrades: number;
  trainTrades: number;
  testTrades: number;
  aggregatePF: number;
  trainPF: number;
  testPF: number;
  passes: boolean;
}

export function walkForwardSplit<T extends { entryTime: Date }>(
  trades: T[],
  toTradeLike: (t: T) => TradeLike
): WalkForwardResult {
  const sorted = trades.slice().sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime());
  const mid = Math.ceil(sorted.length / 2);
  const train = sorted.slice(0, mid);
  const test = sorted.slice(mid);

  const trainM = computeMetrics(train.map(toTradeLike));
  const testM = computeMetrics(test.map(toTradeLike));
  const aggM = computeMetrics(sorted.map(toTradeLike));

  return {
    totalTrades: sorted.length,
    trainTrades: train.length,
    testTrades: test.length,
    aggregatePF: aggM.profitFactor,
    trainPF: trainM.profitFactor,
    testPF: testM.profitFactor,
    passes: trainM.profitFactor >= 1.0 && testM.profitFactor >= 1.0,
  };
}
