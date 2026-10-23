import { PoolScannerStorage } from '../pool-scanner/storage';

export type PoolData = {
  pool_address: string;
  network: string;
  token0_symbol?: string;
  token1_symbol?: string;
  tvl?: number;
  volume_24h?: number;
  volume_7d?: number;
  volume_30d?: number;
  liquidity?: number;
  fee_tier?: number;
  pool_score?: number;
  timestamp_ms: number;
};

export function liquidityScore(pool: PoolData): number {
  // Liquidity score based on liquidity value (from Uniswap V3)
  // Higher liquidity is better, but diminishing returns
  const liq = pool.liquidity ?? 0;
  // Normalize using log scale, assuming liquidity up to 1e12 is good
  if (liq <= 0) return 0;
  const score = Math.min(100, Math.log10(liq + 1) * 10); // log10(1e12)=12, *10=120 -> capped at 100
  return Math.round(score);
}

export function feeScore(pool: PoolData): number {
  // Fee score based on fee_tier and volume
  // Lower fee tier (higher fee %) is generally better for LPs, but depends on volume
  // We'll compute fee APR approximation: (volume_24h * fee_tier / 10000 * 365) / tvl
  const feeTier = pool.fee_tier ?? 500; // default 0.05%
  const volume24h = pool.volume_24h ?? 0;
  const tvl = pool.tvl ?? 1; // avoid div by zero
  if (volume24h <= 0 || tvl <= 0) return 0;
  // Estimated annual fees volume * (fee_tier/10000) * 365
  const annualFees = volume24h * (feeTier / 10000) * 365;
  const feeApr = (annualFees / tvl) * 100; // percentage
  // Fee APR score: higher is better, but cap at reasonable levels (e.g., 50% APR is max score)
  const score = Math.min(100, feeApr * 2); // 50% APR -> 100 score
  return Math.round(score);
}

export function riskScore(pool: PoolData): number {
  // Risk score based on volume stability and TVL change (we don't have historical here, so use proxy)
  // Simpler: risk inversely related to volume and tvl (higher volume/tvl = lower risk)
  // We'll use volume_24h / tvl as a proxy for activity
  const volume24h = pool.volume_24h ?? 0;
  const tvl = pool.tvl ?? 1;
  if (tvl <= 0) return 100; // high risk if no TVL
  const turnover = volume24h / tvl; // daily turnover ratio
  // Higher turnover = lower risk (more active)
  // Score: 0-100, where 0 turnover = 100 risk, high turnover = 0 risk
  // Normalize: assume turnover > 1 (100% daily) is very low risk
  const risk = Math.max(0, Math.min(100, 100 - Math.log10(turnover + 1) * 50));
  return Math.round(risk);
}

export function capitalEfficiencyScore(pool: PoolData): number {
  // Capital efficiency: how well the capital is used to generate fees
  // Similar to fee score but focusing on return per unit liquidity
  // We can approximate as (volume_24h * fee_tier) / liquidity
  const feeTier = pool.fee_tier ?? 500;
  const volume24h = pool.volume_24h ?? 0;
  const liquidity = pool.liquidity ?? 1; // avoid div by zero
  if (volume24h <= 0 || liquidity <= 0) return 0;
  const efficiency = (volume24h * (feeTier / 10000)) / liquidity; // fees per unit liquidity per day
  // Scale to 0-100, assuming efficiency > 0.01 is good
  const score = Math.min(100, efficiency * 10000); // arbitrary scaling
  return Math.round(score);
}

export function opportunityScore(pool: PoolData): number {
  // Composite score: weighted average of components
  const liquidity = liquidityScore(pool);
  const fee = feeScore(pool);
  const risk = riskScore(pool);
  const capital = capitalEfficiencyScore(pool);
  // Weights: liquidity 30%, fee 30%, risk 20%, capital 20%
  const opp = liquidity * 0.3 + fee * 0.3 + risk * 0.2 + capital * 0.2;
  return Math.round(opp);
}

export class OpportunityScorer {
  private poolStorage = new PoolScannerStorage();
  
  async scoreAll(network = 'robinhood'): Promise<Array<PoolData & { 
    liquidity_score: number;
    fee_score: number;
    risk_score: number;
    capital_efficiency_score: number;
    opportunity_score: number;
  }>> {
    const pools = this.poolStorage.getPools();
    // Get latest snapshots for each pool
    const snapshots = this.poolStorage.getPools(); // This gets pool info, need latest snapshot
    // Actually we need to join with snapshots to get latest metrics
    const db = (this.poolStorage as any).db;
    const rows = db.prepare(`
      SELECT p.pool_address, p.network, p.token0_symbol, p.token1_symbol, p.fee_tier,
             s.tvl, s.volume_24h, s.volume_7d, s.volume_30d, s.liquidity, s.pool_score, s.ts
      FROM pools p 
      JOIN pool_snapshots s ON s.pool_fk = p.id 
      WHERE s.ts = (SELECT MAX(ts) FROM pool_snapshots WHERE pool_fk = p.id)
        ${network ? 'AND p.network = ?' : ''}
    `).all(network ?? null);
    
    const scored: any[] = [];
    for (const row of rows) {
      const pool: PoolData = {
        pool_address: row.pool_address,
        network: row.network,
        token0_symbol: row.token0_symbol,
        token1_symbol: row.token1_symbol,
        tvl: row.tvl,
        volume_24h: row.volume_24h,
        volume_7d: row.volume_7d,
        volume_30d: row.volume_30d,
        liquidity: row.liquidity,
        fee_tier: row.fee_tier,
        timestamp_ms: row.ts * 1000 // convert to ms
      };
      const liquidityScoreVal = liquidityScore(pool);
      const feeScoreVal = feeScore(pool);
      const riskScoreVal = riskScore(pool);
      const capitalEfficiencyScoreVal = capitalEfficiencyScore(pool);
      const opportunityScoreVal = opportunityScore(pool);
      scored.push({
        ...pool,
        liquidity_score: liquidityScoreVal,
        fee_score: feeScoreVal,
        risk_score: riskScoreVal,
        capital_efficiency_score: capitalEfficiencyScoreVal,
        opportunity_score: opportunityScoreVal
      });
    }
    // Sort by opportunity score descending
    scored.sort((a, b) => b.opportunity_score - a.opportunity_score);
    return scored;
  }
}
