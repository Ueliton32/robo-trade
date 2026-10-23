export type Provenance = 'DIRECT_ONCHAIN' | 'DIRECT_INDEXER' | 'DERIVED' | 'ESTIMATED' | 'MOCK';

export interface PortfolioSnapshot {
  current_position: {
    position_id: string;
    in_range: boolean;
    tick_lower?: number;
    tick_upper?: number;
    current_tick?: number;
  } | null;
  current_pool: any | null;
  portfolio_health: 'HEALTHY' | 'UNHEALTHY' | 'NEUTRAL';
  portfolio_value: number;
  portfolio_pnl: number;
  lp_alpha?: number;
  lp_alpha_pct?: number;
  portfolio_rank: number;
  portfolio_percentile: number;
  fees: number;
}

export interface MarketRegime {
  state: 'BULLISH' | 'BEARISH' | 'SIDEWAYS' | 'VOLATILE' | 'NEUTRAL';
  confidence: number;
  factors: Record<string, any>;
  provenance?: Provenance;
  timestamp?: number;
}

export interface CrossMarketContext {
  macro_regime: MarketRegime | null;
  market_regime: MarketRegime | null;
  crypto_regime: MarketRegime | null;
  tokenization_regime: MarketRegime | null;
  liquidity_regime: MarketRegime | null;
}

export interface Opportunity {
  opportunity_score: number;
  liquidity_score: number;
  fee_score: number;
  risk_score: number;
  capital_efficiency: number;
  ranking_position: number;
  ranking_percentile: number;
}

export interface DecisionReport {
  timestamp: number;
  portfolio: PortfolioSnapshot;
  market_context: CrossMarketContext;
  opportunity: Opportunity;
  risk: {
    overall_risk: 'LOW' | 'MEDIUM' | 'HIGH';
    primary_risks: string[];
    confidence: number;
  };
  status: {
    status: 'HEALTHY' | 'WATCH' | 'REVIEW' | 'STRONG_CANDIDATE' | 'ROTATE_CANDIDATE' | 'UNHEALTHY';
    status_reason: string;
    watch_items: string[];
  };
  provenance: {
    timestamp: number;
    sources: string[];
    freshness: Record<string, number>;
  };
  explainability: {
    triggered_rules: string[];
    metrics_used: string[];
    modules_used: string[];
  };
}

export type RegimeBadge = 'GREEN' | 'YELLOW' | 'RED';

export function regimeToBadge(state?: string): RegimeBadge {
  if (!state) return 'YELLOW';
  const s = state.toUpperCase();
  if (['BULLISH', 'HEALTHY', 'STRONG'].includes(s)) return 'GREEN';
  if (['BEARISH', 'UNHEALTHY', 'VOLATILE'].includes(s)) return 'RED';
  return 'YELLOW';
}
