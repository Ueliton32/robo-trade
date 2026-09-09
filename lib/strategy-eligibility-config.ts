import { createHash } from 'node:crypto';

export interface StrategyEligibilityConfig {
  version: number;
  confidence: {
    minRawConfidence: number;
    minCompositeProbability?: number;
  };
  coverage: {
    requireMarketRegime: boolean;
    requireAtrRatio: boolean;
    requireVolumeRatio: boolean;
    allowMissingMlProbability: boolean;
  };
  conflicts: {
    rejectOppositeDirectionSamePairTimeframe: boolean;
    minConfidenceGapToOverrideConflict: number;
  };
  volatility: {
    maxAtrRatio: number;
    rejectHighVolatilityNoDirection: boolean;
  };
  liquidity: {
    minVolumeRatio: number;
    maxSpreadPercent: number;
  };
}

function deepFreeze<T extends object>(value: T): Readonly<T> {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') deepFreeze(child as object);
  }
  return Object.freeze(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function fingerprintStrategyEligibilityConfig(config: StrategyEligibilityConfig): string {
  const canonical = JSON.stringify(canonicalize(config));
  return createHash('sha256').update(canonical).digest('hex');
}

export const STRATEGY_ELIGIBILITY_CONFIG_V1 = deepFreeze({
  version: 1,
  confidence: {
    minRawConfidence: 60,
    minCompositeProbability: 0.55,
  },
  coverage: {
    requireMarketRegime: true,
    requireAtrRatio: true,
    requireVolumeRatio: true,
    allowMissingMlProbability: true,
  },
  conflicts: {
    rejectOppositeDirectionSamePairTimeframe: true,
    minConfidenceGapToOverrideConflict: 10,
  },
  volatility: {
    maxAtrRatio: 2.5,
    rejectHighVolatilityNoDirection: true,
  },
  liquidity: {
    minVolumeRatio: 0.3,
    maxSpreadPercent: 0.15,
  },
} satisfies StrategyEligibilityConfig);
