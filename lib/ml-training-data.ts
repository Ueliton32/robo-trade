// Geração de dados de treino pro modelo ML (Fase 6, 05/09/2026) — dado
// real ao vivo (Signal com source=live) ainda é pouco pra treinar
// qualquer coisa com segurança (a Fase 2 de registro completo começou em
// 04/09/2026), então o treino usa o MESMO histórico real de candles que
// lib/backtest-engine.ts já usa, com uma diferença importante: em vez de
// só simular "a estratégia teria disparado aqui, WIN ou LOSS", também
// calcula o regime de mercado NAQUELE EXATO MOMENTO (mesma técnica de
// lib/radar-context-backtest.ts) pra montar o vetor de features
// (lib/ml-features.ts) de cada exemplo.
//
// Garantia de não usar dado futuro: o regime de cada exemplo é calculado
// só com candles de 1h já FECHADOS até o momento do sinal (regimePointer
// abaixo nunca anda pra frente do que já é conhecido nesse ponto do
// histórico) — cópia deliberada do mesmo padrão já auditado em
// lib/radar-context-backtest.ts, não uma lógica nova.
import { getHistoricalKlines, getHistoricalFundingRates } from './binance';
import { REQUIRED_KLINES, STRATEGY_DEFS, ALL_AVAILABLE_PAIRS } from './strategies';
import { classifyRegime } from './regime';
import { computeFeatureVector } from './ml-features';
import {
  simulateOutcome,
  dedupCandleGap,
  minutesForTimeframe,
  RESOLUTION_INTERVAL,
  RESOLUTION_LOOKAHEAD_CANDLES,
  detectForStrategy,
} from './backtest-engine';

const REGIME_MIN_KLINES = 210;
const REGIME_WINDOW = 300;
const DELAY_BETWEEN_COMBOS_MS = 300; // mesmo espaçamento de scripts/backtest-scan.ts, pra não martelar a Binance

export interface MLTrainingExample {
  pair: string;
  timeframe: string;
  entryTime: Date;
  features: number[]; // ordem de FEATURE_NAMES (lib/ml-features.ts)
  label: 0 | 1; // 1 = WIN (bateu alvo antes do stop), 0 = LOSS
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generateExamplesForCombo(
  strategyId: number,
  pair: string,
  timeframe: string,
  months: number
): Promise<MLTrainingExample[]> {
  const required = REQUIRED_KLINES[strategyId] ?? 60;
  const endTime = Date.now();
  const periodStart = endTime - months * 30 * 24 * 60 * 60 * 1000;
  const detectionLookbackMs = required * minutesForTimeframe(timeframe) * 60 * 1000;
  const regimeLookbackMs = REGIME_WINDOW * 60 * 60 * 1000; // regime sempre em 1h
  const fetchStart = periodStart - Math.max(detectionLookbackMs, regimeLookbackMs);

  const detectionKlines = await getHistoricalKlines(pair, timeframe, fetchStart, endTime);
  const regimeKlines = timeframe === '1h' ? detectionKlines : await getHistoricalKlines(pair, '1h', fetchStart, endTime);
  const resolutionKlines = timeframe === RESOLUTION_INTERVAL
    ? detectionKlines
    : await getHistoricalKlines(pair, RESOLUTION_INTERVAL, fetchStart, endTime);

  let fundingSeries: Array<{ time: number; rate: number }> = [];
  if (strategyId === 4) {
    fundingSeries = (await getHistoricalFundingRates(pair, fetchStart, endTime))
      .map((f) => ({ time: f.fundingTime, rate: parseFloat(f.fundingRate ?? '0') }))
      .sort((a, b) => a.time - b.time);
  }

  const examples: MLTrainingExample[] = [];
  const dedupGap = dedupCandleGap(timeframe);
  let lastIdx = -Infinity;
  let fundingIdx = 0;
  let resPointer = 0;
  let regimePointer = 0;

  for (let i = required - 1; i < detectionKlines.length; i++) {
    if (i - lastIdx < dedupGap) continue;
    const window = detectionKlines.slice(i - required + 1, i + 1);

    let fundingRate = 0;
    if (strategyId === 4 && fundingSeries.length) {
      while (fundingIdx < fundingSeries.length - 1 && fundingSeries[fundingIdx + 1].time <= detectionKlines[i].closeTime) {
        fundingIdx++;
      }
      fundingRate = fundingSeries[fundingIdx]?.rate ?? 0;
    }

    const signal = detectForStrategy(strategyId, window, pair, timeframe, fundingRate);
    if (!signal) continue;

    const entryTimeMs = detectionKlines[i].closeTime;

    while (resPointer < resolutionKlines.length && resolutionKlines[resPointer].closeTime <= entryTimeMs) {
      resPointer++;
    }
    const outcome = simulateOutcome(signal, resolutionKlines, resPointer, RESOLUTION_LOOKAHEAD_CANDLES);
    if (!outcome) continue; // não resolveu dentro da janela — descarta, mesmo critério do backtest normal

    // Regime só com candles de 1h já fechados até este ponto — nunca
    // olha candle depois de entryTimeMs.
    while (regimePointer < regimeKlines.length && regimeKlines[regimePointer].closeTime <= entryTimeMs) {
      regimePointer++;
    }
    const regimeWindowEnd = regimePointer;
    const regimeWindowStart = Math.max(0, regimeWindowEnd - REGIME_WINDOW);
    const regimeWindow = regimeKlines.slice(regimeWindowStart, regimeWindowEnd);
    const regimeResult = regimeWindow.length >= REGIME_MIN_KLINES ? classifyRegime(regimeWindow) : null;

    const featureVector = computeFeatureVector({
      direction: signal.direction,
      entryPrice: signal.entryPrice,
      target1: signal.target1,
      stopLoss: signal.stopLoss,
      confidence: signal.confidence,
      marketRegime: regimeResult?.regime ?? null,
      regimeForce: regimeResult?.force ?? null,
      atrRatio: regimeResult?.details?.atrRatio ?? null,
      volumeRatio: regimeResult?.details?.volumeRatio ?? null,
    });

    if (featureVector) {
      examples.push({
        pair,
        timeframe,
        entryTime: new Date(entryTimeMs),
        features: featureVector,
        label: outcome.status === 'WIN' ? 1 : 0,
      });
    }

    lastIdx = i;
  }

  return examples;
}

/**
 * Gera o conjunto de exemplos rotulados de UMA estratégia, iterando pares
 * e timeframes dela. Sequencial e com pausa entre combinações (não
 * paralelo) de propósito — mesmo motivo do scripts/backtest-scan.ts:
 * evitar martelar a API da Binance com dezenas de chamadas simultâneas.
 * Pode demorar — é uma operação manual (scripts/ml-model.ts --train),
 * nunca automática.
 */
export async function generateTrainingExamples(params: {
  strategyId: number;
  pairs?: string[];
  months?: number;
  onProgress?: (msg: string) => void;
}): Promise<MLTrainingExample[]> {
  const strat = STRATEGY_DEFS.find((s) => s.id === params.strategyId);
  if (!strat) throw new Error(`Estratégia ${params.strategyId} não encontrada`);

  const pairs = params.pairs?.length ? params.pairs : ALL_AVAILABLE_PAIRS;
  const months = Math.min(Math.max(params.months ?? 3, 1), 12);

  const examples: MLTrainingExample[] = [];
  let done = 0;
  const total = pairs.length * strat.timeframes.length;

  for (const pair of pairs) {
    for (const timeframe of strat.timeframes) {
      done++;
      try {
        const batch = await generateExamplesForCombo(strat.id, pair, timeframe, months);
        examples.push(...batch);
        params.onProgress?.(`[${done}/${total}] ${pair}/${timeframe}: ${batch.length} exemplo(s) (total acumulado: ${examples.length})`);
      } catch (e: any) {
        params.onProgress?.(`[${done}/${total}] ${pair}/${timeframe}: falhou (${e?.message ?? e})`);
      }
      await sleep(DELAY_BETWEEN_COMBOS_MS);
    }
  }

  return examples;
}

/**
 * Holdout cronológico (mesmo espírito de lib/walk-forward.ts): ordena por
 * tempo e separa treino (parte mais antiga) de teste (parte mais
 * recente), nunca embaralhado — o teste precisa representar "dado que o
 * modelo nunca viu e é posterior ao que ele aprendeu", senão a avaliação
 * fica otimista demais e esconde overfitting.
 */
export function chronoSplit(
  examples: MLTrainingExample[],
  testFraction: number = 0.3
): { train: MLTrainingExample[]; test: MLTrainingExample[] } {
  const sorted = [...examples].sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime());
  const cut = Math.floor(sorted.length * (1 - testFraction));
  return { train: sorted.slice(0, cut), test: sorted.slice(cut) };
}
