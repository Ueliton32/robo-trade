import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'lib/monitoring/lp/pool-scanner/pools.db');

export type PoolMeta = {
  network: string;
  protocol: string;
  dex: string;
  pool_address: string;
  token0_address: string;
  token1_address: string;
  token0_symbol?: string;
  token1_symbol?: string;
  fee_tier?: number;
  pool_created_at?: number;
  source: string;
  provenance: string;
  timestamp_ms: number;
};

export type PoolMetrics = {
  tvl?: number;
  volume_24h?: number;
  volume_7d?: number;
  volume_30d?: number;
  price?: number;
  price_change_24h?: number;
  transactions_24h?: number;
  buyers_24h?: number;
  sellers_24h?: number;
  liquidity?: number;
  market_cap?: number;
  fdv?: number;
  apr?: number;
  rewards_apr?: number;
  freshness_sec?: number;
};

export type PoolSnapshot = PoolMeta & PoolMetrics & {
  block_number?: number;
  pool_score?: number;
};

export class PoolScannerStorage {
  private db: any;
  constructor() {
    this.db = new Database(DB_PATH);
    this.migrate();
  }
  private migrate() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY, applied_at TEXT)`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS pools(id INTEGER PRIMARY KEY AUTOINCREMENT, network TEXT, protocol TEXT, dex TEXT, pool_address TEXT UNIQUE, token0_address TEXT, token1_address TEXT, token0_symbol TEXT, token1_symbol TEXT, fee_tier INTEGER, pool_created_at INTEGER, source TEXT, provenance TEXT, first_seen_ms INTEGER, last_seen_ms INTEGER)`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS pool_snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT, pool_fk INTEGER, ts INTEGER, block_number INTEGER, tvl REAL, volume_24h REAL, volume_7d REAL, volume_30d REAL, price REAL, price_change_24h REAL, transactions_24h INTEGER, buyers_24h INTEGER, sellers_24h INTEGER, liquidity REAL, market_cap REAL, fdv REAL, apr REAL, rewards_apr REAL, pool_score REAL, provenance TEXT, raw_json TEXT, UNIQUE(pool_fk, ts))`);
  }
  upsertPool(meta: PoolMeta): number {
    const existing = this.db.prepare(`SELECT id FROM pools WHERE pool_address = ? AND network = ?`).get(meta.pool_address, meta.network) as any;
    if (existing) {
      this.db.prepare(`UPDATE pools SET last_seen_ms = ?, token0_symbol = COALESCE(?, token0_symbol), token1_symbol = COALESCE(?, token1_symbol), fee_tier = COALESCE(?, fee_tier) WHERE id = ?`).run(meta.timestamp_ms, meta.token0_symbol, meta.token1_symbol, meta.fee_tier, existing.id);
      return existing.id;
    }
    const info = this.db.prepare(`INSERT INTO pools(network,protocol,dex,pool_address,token0_address,token1_address,token0_symbol,token1_symbol,fee_tier,pool_created_at,source,provenance,first_seen_ms,last_seen_ms) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      meta.network, meta.protocol, meta.dex, meta.pool_address, meta.token0_address, meta.token1_address, meta.token0_symbol, meta.token1_symbol, meta.fee_tier, meta.pool_created_at, meta.source, meta.provenance, meta.timestamp_ms, meta.timestamp_ms
    );
    return Number(info.lastInsertRowid);
  }
  insertSnapshot(poolFk: number, snap: Partial<PoolSnapshot>) {
    this.db.prepare(`INSERT OR IGNORE INTO pool_snapshots(pool_fk,ts,block_number,tvl,volume_24h,volume_7d,volume_30d,price,price_change_24h,transactions_24h,buyers_24h,sellers_24h,liquidity,market_cap,fdv,apr,rewards_apr,pool_score,provenance,raw_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      poolFk,
      Math.floor(snap.timestamp_ms!/1000),
      snap.block_number ?? null,
      snap.tvl ?? null,
      snap.volume_24h ?? null,
      snap.volume_7d ?? null,
      snap.volume_30d ?? null,
      snap.price ?? null,
      snap.price_change_24h ?? null,
      snap.transactions_24h ?? null,
      snap.buyers_24h ?? null,
      snap.sellers_24h ?? null,
      snap.liquidity ?? null,
      snap.market_cap ?? null,
      snap.fdv ?? null,
      snap.apr ?? null,
      snap.rewards_apr ?? null,
      snap.pool_score ?? null,
      snap.provenance ?? 'DERIVED',
      JSON.stringify(snap)
    );
  }
  getPools(): any[] {
    return this.db.prepare(`SELECT * FROM pools`).all();
  }
  getPoolByAddress(address: string, network: string) {
    return this.db.prepare(`SELECT * FROM pools WHERE pool_address = ? AND network = ?`).get(address, network);
  }
}
