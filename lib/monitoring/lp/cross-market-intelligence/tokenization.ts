import { fetchJson } from './data-fetcher';

export interface TokenizationFactors {
  market_value_usd?: number;
  holders?: number;
  supply?: number;
  transfer_volume_24h?: number;
  premium_discount?: number; // percent
}

export class TokenizationRegime {
  async fetch(): Promise<{
    state: string;
    confidence: number;
    factors: TokenizationFactors;
    provenance: string;
  }> {
    const factors: TokenizationFactors = {};
    let successCount = 0;
    const totalExpected = 5;

    // Try RWA.xyz API - we'll attempt known endpoints; adjust as needed.
    // Since we don't have exact spec, we'll try a generic stats endpoint.
    try {
      const stats = await fetchJson('https://api.rwa.xyz/v1/stats');
      if (stats) {
        if (stats.market_value_usd !== undefined) {
          factors.market_value_usd = stats.market_value_usd;
          successCount++;
        }
        if (stats.holders !== undefined) {
          factors.holders = stats.holders;
          successCount++;
        }
        if (stats.supply !== undefined) {
          factors.supply = stats.supply;
          successCount++;
        }
        if (stats.transfer_volume_24h !== undefined) {
          factors.transfer_volume_24h = stats.transfer_volume_24h;
          successCount++;
        }
        if (stats.premium_discount !== undefined) {
          factors.premium_discount = stats.premium_discount;
          successCount++;
        }
      }
    } catch (e) {
      console.warn('RWA.xyz stats failed:', e);
    }

    // If the above fails, try alternative endpoints
    if (successCount === 0) {
      try {
        // Maybe a summary endpoint
        const summary = await fetchJson('https://api.rwa.xyz/v1/summary');
        if (summary) {
          // map fields
          if (summary.total_value) factors.market_value_usd = summary.total_value;
          if (summary.unique_holders) factors.holders = summary.unique_holders;
          if (summary.total_supply) factors.supply = summary.total_supply;
          if (summary.transfer_volume) factors.transfer_volume_24h = summary.transfer_volume;
          if (summary.avg_premium_discount) factors.premium_discount = summary.avg_premium_discount;
          if (factors.market_value_usd !== undefined) successCount++;
          if (factors.holders !== undefined) successCount++;
          if (factors.supply !== undefined) successCount++;
          if (factors.transfer_volume_24h !== undefined) successCount++;
          if (factors.premium_discount !== undefined) successCount++;
        }
      } catch (e) {
        console.warn('RWA.xyz summary failed:', e);
      }
    }

    // Determine state based on premium/discount (if available)
    let state = 'NEUTRAL';
    if (factors.premium_discount !== undefined) {
      if (factors.premium_discount > 5) {
        state = 'PREMIUM';
      } else if (factors.premium_discount < -5) {
        state = 'DISCOUNT';
      }
    }

    const confidence = Math.round((successCount / totalExpected) * 100);

    return {
      state,
      confidence,
      factors,
      provenance: 'RWA.xyz'
    };
  }
}
