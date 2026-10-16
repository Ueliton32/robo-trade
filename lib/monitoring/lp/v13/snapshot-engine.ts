// LP Portfolio Monitor V1.3 — Snapshot Engine (TypeScript)
// SQLite persistence with better-sqlite3

import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'lib/monitoring/lp/v13/snapshots.db');

export type SnapshotMeta = {
  chain: string;
  wallet?: string;
  position_id: number;
  pool_address: string;
  protocol: string;
};

export type SnapshotData = {
  ts: number; // Unix seconds
  block_number?: number;
  block_hash?: string;
  current_tick?: number;
  tick_lower?: number;
  tick_upper?: number;
  price_current?: number;
  price_lower?: number;
  price_upper?: number;
  amount0: number;
  amount1: number;
  value_usd: number;
  fees_collected: number;
  fees_uncollected: number;
  fees_total: number;
  lp_total_value: number;
  hodl_value: number;
  lp_net_pnl: number;
  lp_alpha_usd: number;
  lp_alpha_pct: number;
  divergence_pnl: number;
  divergence_pct: number;
  in_range: boolean;
  dist_lower_pct?: number;
  dist_upper_pct?: number;
  revert_freshness_sec?: number;
  provenance: string;
  raw?: any;
};

export class SnapshotEngine {
  private db: any;
  constructor() {
    this.db = new Database(DB_PATH);
    this.migrate();
  }
  private migrate() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY, applied_at TEXT)`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS positions(id INTEGER PRIMARY KEY AUTOINCREMENT, chain TEXT, wallet TEXT, position_id INTEGER, pool_address TEXT, protocol TEXT, UNIQUE(chain,position_id,protocol))`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT, position_fk INTEGER, ts INTEGER, block_number INTEGER, block_hash TEXT, current_tick INTEGER, tick_lower INTEGER, tick_upper INTEGER, price_current REAL, price_lower REAL, price_upper REAL, amount0 REAL, amount1 REAL, value_usd REAL, fees_collected REAL, fees_uncollected REAL, fees_total REAL, lp_total_value REAL, hodl_value REAL, lp_net_pnl REAL, lp_alpha_usd REAL, lp_alpha_pct REAL, divergence_pnl REAL, divergence_pct REAL, in_range INTEGER, dist_lower_pct REAL, dist_upper_pct REAL, revert_freshness_sec INTEGER, provenance TEXT, raw_json TEXT, UNIQUE(position_fk,block_number,ts))`);
  }
  captureSnapshot(meta: SnapshotMeta, data: SnapshotData): boolean {
    const pos = this.db.prepare(`INSERT OR IGNORE INTO positions(chain,wallet,position_id,pool_address,protocol) VALUES(?,?,?,?,?)`).run(meta.chain, meta.wallet ?? null, meta.position_id, meta.pool_address, meta.protocol);
    const row = this.db.prepare(`SELECT id FROM positions WHERE chain=? AND position_id=? AND protocol=?`).get(meta.chain, meta.position_id, meta.protocol) as any;
    const dup = this.db.prepare(`SELECT id FROM snapshots WHERE position_fk=? AND block_number=? AND ts=?`).get(row.id, data.block_number, data.ts);
    if (dup) return false;
    this.db.prepare(`INSERT INTO snapshots(position_fk,ts,block_number,block_hash,current_tick,tick_lower,tick_upper,price_current,price_lower,price_upper,amount0,amount1,value_usd,fees_collected,fees_uncollected,fees_total,lp_total_value,hodl_value,lp_net_pnl,lp_alpha_usd,lp_alpha_pct,divergence_pnl,divergence_pct,in_range,dist_lower_pct,dist_upper_pct,revert_freshness_sec,provenance,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      row.id,
      data.ts,
      data.block_number,
      data.block_hash,
      data.current_tick,
      data.tick_lower,
      data.tick_upper,
      data.price_current,
      data.price_lower,
      data.price_upper,
      data.amount0,
      data.amount1,
      data.value_usd,
      data.fees_collected,
      data.fees_uncollected,
      data.fees_total,
      data.lp_total_value,
      data.hodl_value,
      data.lp_net_pnl,
      data.lp_alpha_usd,
      data.lp_alpha_pct,
      data.divergence_pnl,
      data.divergence_pct,
      data.in_range ? 1 : 0,
      data.dist_lower_pct,
      data.dist_upper_pct,
      data.revert_freshness_sec,
      data.provenance,
      JSON.stringify(data.raw ?? {})
    );
    return true;
  }
}