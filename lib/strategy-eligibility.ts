import {
  fingerprintStrategyEligibilityConfig,
  StrategyEligibilityConfig,
} from './strategy-eligibility-config';

export type TradeDirection = 'LONG' | 'SHORT';
export type StrategyEligibilityDecision = 'ELIGIBLE' | 'INELIGIBLE';

export type StrategyEligibilityReasonCode =
  | 'PASS_ALL_CHECKS'
  | 'LOW_CONFIDENCE'
  | 'LOW_COMPOSITE_PROBABILITY'
  | 'MISSING_MARKET_REGIME'
  | 'MISSING_ATR_RATIO'
  | 'MISSING_VOLUME_RATIO'
  | 'MISSING_ML_PROBABILITY_ALLOWED'
  | 'MISSING_ML_PROBABILITY_REQUIRED'
  | 'OPPOSITE_DIRECTION_CONFLICT'
  | 'ATR_RATIO_TOO_HIGH'
  | 'HIGH_VOLATILITY_NO_DIRECTION'
  | 'VOLUME_RATIO_TOO_LOW'
  | 'SPREAD_TOO_WIDE';

export interface StrategyEligibilitySignalInput {
  strategyId: number;
  strategyName: string;
  pair: string;
  timeframe: string;
  direction: TradeDirection;
  confidence: number;
  marketRegime?: string | null;
  regimeForce?: number | null;
  atrRatio?: number | null;
  volumeRatio?: number | null;
  spreadAtSignal?: number | null;
  mlProbability?: number | null;
  mlModelVersion?: number | null;
  weightAtSignal?: number | null;
}

export interface StrategyEligibilityCycleCandidate {
  strategyId: number;
  pair: string;
  timeframe: string;
  direction: TradeDirection;
  confidence: number;
  mlProbability?: number | null;
}

export interface StrategyEligibilityInput {
  signal: StrategyEligibilitySignalInput;
  context: {
    cycleCandidates: StrategyEligibilityCycleCandidate[];
    pendingExposure?: {
      samePairPendingCount?: number;
      totalPendingCount?: number;
    };
  };
  config: StrategyEligibilityConfig;
}

export interface StrategyEligibilityResult {
  decision: StrategyEligibilityDecision;
  direction: TradeDirection;
  eligible: boolean;
  reasonCodes: StrategyEligibilityReasonCode[];
  audit: {
    configVersion: number;
    configFingerprint: string;
    evaluatedAt: string;
    checks: {
      confidence: boolean;
      coverage: boolean;
      conflicts: boolean;
      volatility: boolean;
      liquidity: boolean;
    };
  };
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function confidenceReasons(input: StrategyEligibilityInput): StrategyEligibilityReasonCode[] {
  const reasons: StrategyEligibilityReasonCode[] = [];
  const { signal, config } = input;
  if (signal.confidence < config.confidence.minRawConfidence) reasons.push('LOW_CONFIDENCE');
  if (
    hasValue(signal.mlProbability) &&
    config.confidence.minCompositeProbability !== undefined &&
    signal.mlProbability! < config.confidence.minCompositeProbability
  ) {
    reasons.push('LOW_COMPOSITE_PROBABILITY');
  }
  return reasons;
}

function coverageReasons(input: StrategyEligibilityInput): StrategyEligibilityReasonCode[] {
  const reasons: StrategyEligibilityReasonCode[] = [];
  const { signal, config } = input;
  if (config.coverage.requireMarketRegime && !hasValue(signal.marketRegime)) reasons.push('MISSING_MARKET_REGIME');
  if (config.coverage.requireAtrRatio && !hasValue(signal.atrRatio)) reasons.push('MISSING_ATR_RATIO');
  if (config.coverage.requireVolumeRatio && !hasValue(signal.volumeRatio)) reasons.push('MISSING_VOLUME_RATIO');
  if (!hasValue(signal.mlProbability)) {
    reasons.push(config.coverage.allowMissingMlProbability ? 'MISSING_ML_PROBABILITY_ALLOWED' : 'MISSING_ML_PROBABILITY_REQUIRED');
  }
  return reasons;
}

function conflictReasons(input: StrategyEligibilityInput): StrategyEligibilityReasonCode[] {
  const { signal, context, config } = input;
  if (!config.conflicts.rejectOppositeDirectionSamePairTimeframe) return [];

  const strongestOpposite = context.cycleCandidates
    .filter((candidate) =>
      candidate.pair === signal.pair &&
      candidate.timeframe === signal.timeframe &&
      candidate.direction !== signal.direction
    )
    .reduce<StrategyEligibilityCycleCandidate | null>((best, candidate) => {
      if (!best) return candidate;
      return candidate.confidence > best.confidence ? candidate : best;
    }, null);

  if (!strongestOpposite) return [];
  const confidenceGap = signal.confidence - strongestOpposite.confidence;
  return confidenceGap >= config.conflicts.minConfidenceGapToOverrideConflict ? [] : ['OPPOSITE_DIRECTION_CONFLICT'];
}

function volatilityReasons(input: StrategyEligibilityInput): StrategyEligibilityReasonCode[] {
  const reasons: StrategyEligibilityReasonCode[] = [];
  const { signal, config } = input;
  if (hasValue(signal.atrRatio) && signal.atrRatio! > config.volatility.maxAtrRatio) reasons.push('ATR_RATIO_TOO_HIGH');
  if (
    config.volatility.rejectHighVolatilityNoDirection &&
    signal.marketRegime === 'ALTA_VOLATILIDADE_SEM_DIRECAO'
  ) {
    reasons.push('HIGH_VOLATILITY_NO_DIRECTION');
  }
  return reasons;
}

function liquidityReasons(input: StrategyEligibilityInput): StrategyEligibilityReasonCode[] {
  const reasons: StrategyEligibilityReasonCode[] = [];
  const { signal, config } = input;
  if (hasValue(signal.volumeRatio) && signal.volumeRatio! < config.liquidity.minVolumeRatio) reasons.push('VOLUME_RATIO_TOO_LOW');
  if (hasValue(signal.spreadAtSignal) && signal.spreadAtSignal! > config.liquidity.maxSpreadPercent) reasons.push('SPREAD_TOO_WIDE');
  return reasons;
}

export function evaluateStrategyEligibility(input: StrategyEligibilityInput): StrategyEligibilityResult {
  const confidence = confidenceReasons(input);
  const coverage = coverageReasons(input);
  const blockingCoverage = coverage.filter((reason) => reason !== 'MISSING_ML_PROBABILITY_ALLOWED');
  const conflicts = conflictReasons(input);
  const volatility = volatilityReasons(input);
  const liquidity = liquidityReasons(input);

  const blockingReasons = [...confidence, ...blockingCoverage, ...conflicts, ...volatility, ...liquidity];
  const eligible = blockingReasons.length === 0;
  const reasonCodes: StrategyEligibilityReasonCode[] = eligible
    ? ['PASS_ALL_CHECKS']
    : [...blockingReasons, ...coverage.filter((reason) => reason === 'MISSING_ML_PROBABILITY_ALLOWED')];

  return {
    decision: eligible ? 'ELIGIBLE' : 'INELIGIBLE',
    direction: input.signal.direction,
    eligible,
    reasonCodes,
    audit: {
      configVersion: input.config.version,
      configFingerprint: fingerprintStrategyEligibilityConfig(input.config),
      evaluatedAt: new Date().toISOString(),
      checks: {
        confidence: confidence.length === 0,
        coverage: blockingCoverage.length === 0,
        conflicts: conflicts.length === 0,
        volatility: volatility.length === 0,
        liquidity: liquidity.length === 0,
      },
    },
  };
}
