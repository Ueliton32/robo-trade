import { fetchJson } from './data-fetcher';

export interface CryptoFactors {
  btc_price_usd?: number;
  eth_price_usd?: number;
  market_cap_usd?: number;
  btc_dominance?: number;
  eth_dominance?: number;
  fear_greed?: number; // 0-100
}

export class CryptoRegime {
  async fetch(): Promise<{
    state: string;
    confidence: number;
    factors: CryptoFactors;
    provenance: string;
  }> {
    const factors: CryptoFactors = {};
    let successCount = 0;
    const totalExpected = 5; // BTC, ETH, market cap, btc dominance, fear_greed (optional)

    try {
      // CoinGecko simple price
      const priceData = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_market_cap=false&include_24hr_vol=false&include_24hr_change=false&include_last_updated_at=false');
      if (priceData) {
        if (priceData.bitcoin?.usd) {
          factors.btc_price_usd = priceData.bitcoin.usd;
          successCount++;
        }
        if (priceData.ethereum?.usd) {
          factors.eth_price_usd = priceData.ethereum.usd;
          successCount++;
        }
      }
    } catch (e) {
      console.warn('CoinGecko price failed:', e);
    }

    try {
      // Global data
      const globalData = await fetchJson('https://api.coingecko.com/api/v3/global');
      if (globalData && globalData.data) {
        const data = globalData.data;
        if (data.total_market_cap?.usd) {
          factors.market_cap_usd = data.total_market_cap.usd;
          successCount++;
        }
        if (data.market_cap_percentage?.btc) {
          factors.btc_dominance = data.market_cap_percentage.btc;
          successCount++;
        }
        if (data.market_cap_percentage?.eth) {
          factors.eth_dominance = data.market_cap_percentage.eth;
          successCount++;
        }
      }
    } catch (e) {
      console.warn('CoinGecko global failed:', e);
    }

    // Fear & Greed Index (alternative.me) - not in authorized list but we can try; if fails, we skip.
    try {
      const fgData = await fetchJson('https://api.alternative.me/fng/?limit=1');
      if (fgData && fgData.data && fgData.data.length > 0) {
        const value = parseInt(fgData.data[0].value, 10);
        if (!isNaN(value)) {
          factors.fear_greed = value;
          successCount++;
        }
      }
    } catch (e) {
      // ignore, not required
    }

    // Determine state based on BTC dominance and market cap trend (simplified)
    let state = 'NEUTRAL';
    if (factors.btc_dominance !== undefined && factors.btc_dominance > 50) {
      state = 'BTC_DOMINANT';
    } else if (factors.btc_dominance !== undefined && factors.btc_dominance < 40) {
      state = 'ALTSEASON';
    }

    // Confidence based on success of required factors (excluding fear_greed)
    const requiredSuccess = (factors.btc_price_usd !== undefined ? 1 : 0) +
                            (factors.eth_price_usd !== undefined ? 1 : 0) +
                            (factors.market_cap_usd !== undefined ? 1 : 0) +
                            (factors.btc_dominance !== undefined ? 1 : 0);
    const requiredTotal = 4;
    const confidence = Math.round((requiredSuccess / requiredTotal) * 100);

    return {
      state,
      confidence,
      factors,
      provenance: 'CoinGecko + Alternative.me (FG)'
    };
  }
}
