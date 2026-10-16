import { fetchJson, fetchText } from './data-fetcher';

export interface MarketFactors {
  sp500_price?: number;
  nasdaq_price?: number;
  dow_price?: number;
  vix?: number;
  dxy?: number;
  russell_2000?: number;
}

export class MarketRegime {
  // Finnhub demo token? We'll try without key first; many endpoints require token.
  // We'll use Yahoo Finance via CSV? But we stick to authorized: Finnhub.
  // If fails, we fallback to unknown.

  async fetch(): Promise<{
    state: string;
    confidence: number;
    factors: MarketFactors;
    provenance: string;
  }> {
    const factors: MarketFactors = {};
    let successCount = 0;
    const totalExpected = 6;

    // Helper
    const tryFetchJson = async (url: string, setter: (value: number) => void) => {
      try {
        const data = await fetchJson(url);
        // Finnhub returns { c: current, h: high, l: low, o: open, pc: previous close, t: timestamp }
        if (data && data.c !== undefined) {
          const value = parseFloat(data.c);
          if (!isNaN(value)) {
            setter(value);
            successCount++;
          }
        }
      } catch (e) {
        // ignore
      }
    };

    // Try Finnhub for major indices
    // Note: Finnhub free tier delayed data, but okay for regime.
    // We'll use symbol: SPY for S&P 500, QQQ for Nasdaq, etc.
    const base = 'https://finnhub.io/api/v1/quote';
    const token = 'demo'; // Finnhub demo token works for some endpoints? Actually demo token limited.
    // We'll try without token first; if 401, we'll skip.

    const trySymbol = async (symbol: string, setter: (v: number) => void) => {
      const url = `${base}?symbol=${symbol}&token=${token}`;
      await tryFetchJson(url, setter);
    };

    await trySymbol('SPY', (v) => { factors.sp500_price = v; });
    await trySymbol('QQQ', (v) => { factors.nasdaq_price = v; });
    await trySymbol('DJIA', (v) => { factors.dow_price = v; }); // DJIA might not work, try ^DJI?
    await trySymbol('^VIX', (v) => { factors.vix = v; });
    await trySymbol('UUP', (v) => { factors.dxy = v; }); // approximate
    await trySymbol('IWM', (v) => { factors.russell_2000 = v; });

    // Determine state based on volatility and trend
    let state = 'NEUTRAL';
    if (factors.vix !== undefined && factors.vix > 30) {
      state = 'HIGH_VOLATILITY';
    } else if (factors.vix !== undefined && factors.vix < 15) {
      state = 'LOW_VOLATILITY';
    }

    const confidence = Math.round((successCount / totalExpected) * 100);

    return {
      state,
      confidence,
      factors,
      provenance: 'Finnhub (demo token)'
    };
  }
}
