import { fetchJson } from './data-fetcher';

export interface MacroFactors {
  fed_funds_rate?: number;
  cpi_yoy?: number;
  pce_yoy?: number;
  gdp_qoq?: number;
  unemployment_rate?: number;
  payroll_change?: number;
  treasury_2y?: number;
  treasury_5y?: number;
  treasury_10y?: number;
  treasury_30y?: number;
  yield_curve_10y_2y?: number;
}

export class MacroRegime {
  private static readonly FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

  async fetch(): Promise<{
    state: string;
    confidence: number;
    factors: MacroFactors;
    provenance: string;
  }> {
    const factors: MacroFactors = {};
    console.log('FRED_BASE:', MacroRegime.FRED_BASE);
    let successCount = 0;
    const totalExpected = 9; // number of direct indicators we try

    // Helper to try fetch
    const tryFetch = async (url: string, setter: (value: number) => void) => {
      try {
        const data = await fetchJson(url);
        if (data && data.observations && data.observations.length > 0) {
          const latest = data.observations[data.observations.length - 1];
          const value = parseFloat(latest.value);
          if (!isNaN(value)) {
            setter(value);
            successCount++;
          }
        }
      } catch (e) {
        // ignore, will be handled by confidence
      }
    };

    // Fed Funds Rate (FEDFUNDS)
    await tryFetch(
      `${MacroRegime.FRED_BASE}?series_id=FEDFUNDS&api_key=demo&file_type=json&limit=1&sort_order=desc`,
      (v) => { factors.fed_funds_rate = v; }
    );

    // CPI (CPIAUCSL) - we'll treat as index level, not YoY
    await tryFetch(
      `${MacroRegime.FRED_BASE}?series_id=CPIAUCSL&api_key=demo&file_type=json&limit=1&sort_order=desc`,
      (v) => { factors.cpi_yoy = v; }
    );

    // PCE (PCEPI) - price index
    await tryFetch(
      `${MacroRegime.FRED_BASE}?series_id=PCEPI&api_key=demo&file_type=json&limit=1&sort_order=desc`,
      (v) => { factors.pce_yoy = v; }
    );

    // GDP (GDP) - quarterly change? We'll get latest and assume it's the value
    await tryFetch(
      `${MacroRegime.FRED_BASE}?series_id=GDP&api_key=demo&file_type=json&limit=1&sort_order=desc`,
      (v) => { factors.gdp_qoq = v; }
    );

    // Unemployment Rate (UNRATE)
    await tryFetch(
      `${MacroRegime.FRED_BASE}?series_id=UNRATE&api_key=demo&file_type=json&limit=1&sort_order=desc`,
      (v) => { factors.unemployment_rate = v; }
    );

    // Payrolls (PAYEMS)
    await tryFetch(
      `${MacroRegime.FRED_BASE}?series_id=PAYEMS&api_key=demo&file_type=json&limit=1&sort_order=desc`,
      (v) => { factors.payroll_change = v; }
    );

    // Treasury yields
    await tryFetch(
      `${MacroRegime.FRED_BASE}?series_id=DGS2&api_key=demo&file_type=json&limit=1&sort_order=desc`,
      (v) => { factors.treasury_2y = v; }
    );
    await tryFetch(
      `${MacroRegime.FRED_BASE}?series_id=DGS5&api_key=demo&file_type=json&limit=1&sort_order=desc`,
      (v) => { factors.treasury_5y = v; }
    );
    await tryFetch(
      `${MacroRegime.FRED_BASE}?series_id=DGS10&api_key=demo&file_type=json&limit=1&sort_order=desc`,
      (v) => { factors.treasury_10y = v; }
    );
    await tryFetch(
      `${MacroRegime.FRED_BASE}?series_id=DGS30&api_key=demo&file_type=json&limit=1&sort_order=desc`,
      (v) => { factors.treasury_30y = v; }
    );

    // Determine state based on simple rules
    let state = 'NEUTRAL';
    if (factors.fed_funds_rate !== undefined && factors.fed_funds_rate > 5) {
      state = 'RESTRICTIVE';
    } else if (factors.fed_funds_rate !== undefined && factors.fed_funds_rate < 2) {
      state = 'ACCOMMODATIVE';
    }

    // If we have both 10y and 2y, compute yield curve
    if (factors.treasury_10y !== undefined && factors.treasury_2y !== undefined) {
      factors.yield_curve_10y_2y = factors.treasury_10y - factors.treasury_2y;
    }

    // Confidence based on success rate (excluding yield_curve as it's derived)
    const confidence = Math.round((successCount / totalExpected) * 100);

    // Determine provenance
    let provenance = 'FRED';
    if (successCount === 0) {
      provenance = 'FRED (failed)';
    } else if (successCount < totalExpected) {
      provenance = 'FRED (partial)';
    }

    return {
      state,
      confidence,
      factors,
      provenance
    };
  }
}
