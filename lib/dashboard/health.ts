import Database from 'better-sqlite3';
import { join } from 'path';

const SNAPSHOT_DB = join(process.cwd(), 'lib/monitoring/lp/v13/snapshots.db');
const POOL_DB = join(process.cwd(), 'lib/monitoring/lp/pool-scanner/pools.db');
const OPP_DB = join(process.cwd(), 'lib/monitoring/lp/opportunity-engine/opportunity.db');
const CROSS_DB = join(process.cwd(), 'lib/monitoring/lp/cross-market-intelligence/cross-market.db');

export function getHealthStatus() {
  try {
    const snapshotExists = require('fs').existsSync(SNAPSHOT_DB);
    const poolExists = require('fs').existsSync(POOL_DB);
    const oppExists = require('fs').existsSync(OPP_DB);
    const crossExists = require('fs').existsSync(CROSS_DB);
    
    return {
      snapshot_db: { ok: snapshotExists, path: SNAPSHOT_DB },
      pool_db: { ok: poolExists, path: POOL_DB },
      opportunity_db: { ok: oppExists, path: OPP_DB },
      cross_market_db: { ok: crossExists, path: CROSS_DB },
      revert_status: 'unknown',
      rpc_status: 'unknown',
      coingecko_status: 'unknown',
      scheduler_status: 'running',
      build_version: '1.0.0',
      git_tag: 'v1.0.0'
    };
  } catch (e) {
    return { error: String(e) };
  }
}
