import Database from 'better-sqlite3';
import { join } from 'path';

const OPPORTUNITY_DB = join(process.cwd(), 'lib/monitoring/lp/opportunity-engine/opportunity.db');
const SNAPSHOT_DB = join(process.cwd(), 'lib/monitoring/lp/v13/snapshots.db');

export type RadarScorePoint = { ts: number | null; opportunityScore: number | null };
export type RadarAlphaPoint = { ts: number | null; lpAlphaPct: number | null };

export function getRadarHistory(poolAddress: string | null) {
  const scoreHistory: RadarScorePoint[] = [];
  const alphaHistory: RadarAlphaPoint[] = [];

  if (poolAddress) {
    const opportunityDb = new Database(OPPORTUNITY_DB, { readonly: true, fileMustExist: true });
    try {
      const rows = opportunityDb.prepare(`
        SELECT ts, opportunity_score
        FROM opportunity_snapshots
        WHERE lower(pool_address) = lower(?) AND ts IS NOT NULL
        ORDER BY ts DESC
        LIMIT 90
      `).all(poolAddress) as Array<{ ts: number | null; opportunity_score: number | null }>;
      scoreHistory.push(...rows.map((row) => ({ ts: row.ts, opportunityScore: row.opportunity_score })));
    } finally {
      opportunityDb.close();
    }
  }

  const snapshotDb = new Database(SNAPSHOT_DB, { readonly: true, fileMustExist: true });
  try {
    const rows = snapshotDb.prepare(`
      SELECT ts, lp_alpha_pct
      FROM snapshots
      WHERE ts IS NOT NULL
      ORDER BY ts DESC
      LIMIT 90
    `).all() as Array<{ ts: number | null; lp_alpha_pct: number | null }>;
    alphaHistory.push(...rows.map((row) => ({ ts: row.ts, lpAlphaPct: row.lp_alpha_pct })));
  } finally {
    snapshotDb.close();
  }

  return { scoreHistory, alphaHistory };
}
