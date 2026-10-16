import { OpportunityStorage } from './storage';
import { OpportunityScorer } from './scorer';

export class OpportunityEngine {
  private storage = new OpportunityStorage();
  private scorer = new OpportunityScorer();

  async run(network = 'robinhood'): Promise<void> {
    console.log(`[OpportunityEngine] Scoring pools for ${network}`);
    const scoredPools = await this.scorer.scoreAll(network);
    let stored = 0;
    for (const pool of scoredPools) {
      if (!pool.pool_address) continue;
      this.storage.upsertSnapshot({
        pool_address: pool.pool_address,
        network: pool.network,
        token0_symbol: pool.token0_symbol,
        token1_symbol: pool.token1_symbol,
        source: 'opportunity-engine',
        provenance: 'DERIVED',
        timestamp_ms: pool.timestamp_ms,
        ts: Math.floor(pool.timestamp_ms / 1000),
        liquidity_score: pool.liquidity_score,
        fee_score: pool.fee_score,
        risk_score: pool.risk_score,
        capital_efficiency_score: pool.capital_efficiency_score,
        opportunity_score: pool.opportunity_score
      });
      stored++;
    }
    console.log(`[OpportunityEngine] Scored and stored ${stored}/${scoredPools.length} pools`);
  }

  getTopOpportunities(limit = 10, network?: string): any[] {
    const rows = this.storage.getLatestSnapshots(network);
    return rows.slice(0, limit);
  }

  getOpportunityForPool(poolAddress: string, network?: string): any | null {
    const all = this.storage.getLatestSnapshots(network);
    const found = all.find(r => r.pool_address.toLowerCase() === poolAddress.toLowerCase());
    return found ?? null;
  }
}
