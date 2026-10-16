import { PoolScannerStorage } from '../pool-scanner/storage';

export interface LiquidityFactors {
  tvl_usd?: number;
  volume_24h_usd?: number;
  volume_7d_usd?: number;
  volume_30d_usd?: number;
  turnover_24h?: number; // volume / tvl
  pool_count?: number;
}

export class LiquidityRegime {
  private poolStorage = new PoolScannerStorage();

  async fetch(): Promise<{
    state: string;
    confidence: number;
    factors: LiquidityFactors;
    provenance: string;
  }> {
    const factors: LiquidityFactors = {};
    let successCount = 0;
    const totalExpected = 6; // tvl, volume_24h, volume_7d, volume_30d, turnover_24h, pool_count

    try {
      const pools = this.poolStorage.getPools(); // returns array of pool objects with tvl, volume_24h, etc.
      if (pools && pools.length > 0) {
        let tvl = 0;
        let volume24h = 0;
        let volume7d = 0;
        let volume30d = 0;
        let validCount = 0;

        for (const p of pools) {
          const pTvl = p.tvl ?? 0;
          const pVol24h = p.volume_24h ?? 0;
          const pVol7d = p.volume_7d ?? 0;
          const pVol30d = p.volume_30d ?? 0;
          if (pTvl > 0) {
            tvl += pTvl;
            volume24h += pVol24h;
            volume7d += pVol7d;
            volume30d += pVol30d;
            validCount++;
          }
        }

        if (validCount > 0) {
          factors.tvl_usd = tvl;
          factors.volume_24h_usd = volume24h;
          factors.volume_7d_usd = volume7d;
          factors.volume_30d_usd = volume30d;
          factors.turnover_24h = tvl > 0 ? volume24h / tvl : 0;
          factors.pool_count = validCount;

          successCount = totalExpected; // all derived from pools
        }
      }
    } catch (e) {
      console.warn('Failed to compute liquidity from pool scanner:', e);
    }

    // Determine state based on turnover and tvl trend (simplified)
    let state = 'NEUTRAL';
    if (factors.tvl_usd !== undefined && factors.turnover_24h !== undefined) {
      // High turnover + high TVL = LIQUID
      // Low turnover = ILLIQUID
      if (factors.turnover_24h > 0.1 && factors.tvl_usd > 1000000) { // arbitrary thresholds
        state = 'LIQUID';
      } else if (factors.turnover_24h < 0.01) {
        state = 'ILLIQUID';
      }
    }

    const confidence = Math.round((successCount / totalExpected) * 100);

    return {
      state,
      confidence,
      factors,
      provenance: 'Pool Scanner aggregated'
    };
  }
}
