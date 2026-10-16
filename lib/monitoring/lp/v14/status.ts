// LP Portfolio Monitor V1.4 — Status Reporter
// Reads the snapshot database and reports the latest snapshot and aggregates.

import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'lib/monitoring/lp/v13/snapshots.db');

type SnapshotRow = {
  id: number;
  position_fk: number;
  ts: number;
  block_number: number | null;
  block_hash: string | null;
  current_tick: number | null;
  tick_lower: number | null;
  tick_upper: number | null;
  price_current: number | null;
  price_lower: number | null;
  price_upper: number | null;
  amount0: number | null;
  amount1: number | null;
  value_usd: number | null;
  fees_collected: number | null;
  fees_uncollected: number | null;
  fees_total: number | null;
  lp_total_value: number | null;
  hodl_value: number | null;
  lp_net_pnl: number | null;
  lp_alpha_usd: number | null;
  lp_alpha_pct: number | null;
  divergence_pnl: number | null;
  divergence_pct: number | null;
  in_range: number; // 0 or 1
  dist_lower_pct: number | null;
  dist_upper_pct: number | null;
  revert_freshness_sec: number | null;
  provenance: string;
  raw_json: string | null;
};

type PositionRow = {
  id: number;
  chain: string;
  wallet: string | null;
  position_id: number;
  pool_address: string;
  protocol: string;
};

function main() {
  try {
    const db = new Database(DB_PATH);
    // Get the latest snapshot
    const latest = db.prepare(`
      SELECT s.*, p.chain, p.wallet, p.position_id, p.pool_address, p.protocol
      FROM snapshots s
      JOIN positions p ON s.position_fk = p.id
      ORDER BY s.ts DESC
      LIMIT 1
    `).get() as SnapshotRow & PositionRow | undefined;

    if (!latest) {
      console.log('No snapshots found in the database.');
      return;
    }

    const latestTime = new Date(latest.ts * 1000);
    const ageMs = Date.now() - latestTime.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);

    // Get total snapshots count
    const totalSnapshots = db.prepare('SELECT COUNT(*) as count FROM snapshots').get().count as number;

    // Get earliest snapshot for historical period
    const earliest = db.prepare('SELECT MIN(ts) as min_ts FROM snapshots').get().min_ts as number | null;
    const periodHours = earliest ? (Date.now() / 1000 - earliest) / (60 * 60) : 0;

    // Get last execution info (we don't have a separate table, so we use the latest snapshot's timestamp as proxy)
    // We could add an executions table, but for now we'll just note the latest snapshot time.

    console.log('=== LP Portfolio Monitor V1.4 Status ===');
    console.log(`Position: ${latest.chain} ${latest.protocol} #${latest.position_id}`);
    console.log(`Pool: ${latest.pool_address}`);
    console.log(`Wallet: ${latest.wallet ?? 'N/A'}`);
    console.log('');
    console.log('Latest Snapshot:');
    console.log(`  Timestamp: ${latestTime.toISOString()} (${ageHours.toFixed(2)} hours ago)`);
    console.log(`  Block number: ${latest.block_number ?? 'N/A'}`);
    console.log(`  Snapshot inserted: true (by definition)`);
    console.log(`  Revert freshness: ${latest.revert_freshness_sec ?? 'N/A'} seconds`);
    console.log(`  Provenance: ${latest.provenance}`);
    console.log('');
    console.log('Metrics from latest snapshot:');
    console.log(`  Current value: $${latest.value_usd?.toFixed(2) ?? 'N/A'}`);
    console.log(`  HODL value: $${latest.hodl_value?.toFixed(2) ?? 'N/A'}`);
    console.log(`  Divergence PnL: $${latest.divergence_pnl?.toFixed(6) ?? 'N/A'} (${(latest.divergence_pct ?? 0).toFixed(4)}%)`);
    console.log(`  Total fees: $${latest.fees_total?.toFixed(6) ?? 'N/A'}`);
    console.log(`  LP total value: $${latest.lp_total_value?.toFixed(2) ?? 'N/A'}`);
    console.log(`  LP net PnL: $${latest.lp_net_pnl?.toFixed(6) ?? 'N/A'}`);
    console.log(`  LP Alpha: $${latest.lp_alpha_usd?.toFixed(6) ?? 'N/A'} (${(latest.lp_alpha_pct ?? 0).toFixed(4)}%)`);
    console.log(`  In range: ${latest.in_range ? 'YES' : 'NO'}`);
    console.log(`  Distance to lower bound: ${latest.dist_lower_pct ?? 'N/A'}%`);
    console.log(`  Distance to upper bound: ${latest.dist_upper_pct ?? 'N/A'}%`);
    console.log('');
    console.log('Aggregates:');
    console.log(`  Total snapshots: ${totalSnapshots}`);
    console.log(`  Historical period: ${periodHours.toFixed(2)} hours`);
    console.log('');
    console.log('Note: Time-series metrics (24H/7D/30D) not implemented in this status report.');
    console.log('=== End of Status ===');
  } catch (e) {
    console.error('Failed to read status:', e);
    process.exit(1);
  }
}

main();