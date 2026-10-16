import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'lib/monitoring/lp/opportunity-engine/opportunity.db');

export type OpportunityMeta = {
  pool_address: string;
  network: string;
  token0_symbol?: string;
  token1_symbol?: string;
  source: string;
  provenance: string;
  timestamp_ms: number;
};

export type OpportunityScores = {
  liquidity_score?: number;
  fee_score?: number;
  risk_score?: number;
  capital_efficiency_score?: number;
  opportunity_score?: number;
};

export type OpportunitySnapshot = OpportunityMeta & OpportunityScores & {
  ts: number; // Unix seconds
};

export class OpportunityStorage {
  private db: any;
  constructor() {
    this.db = new Database(DB_PATH);
    this.migrate();
  }
  private migrate() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY, applied_at TEXT)`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS opportunity_snapshots(id INTEGER PRIMARY KEY AUTOINCREMENT, pool_address TEXT, network TEXT, token0_symbol TEXT, token1_symbol TEXT, source TEXT, provenance TEXT, ts INTEGER, liquidity_score REAL, fee_score REAL, risk_score REAL, capital_efficiency_score REAL, opportunity_score REAL, UNIQUE(pool_address, ts))`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_opportunity_pool_ts ON opportunity_snapshots(pool_address, ts)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_opportunity_score ON opportunity_snapshots(opportunity_score DESC)`);
  }
  upsertSnapshot(snap: OpportunitySnapshot): number {
    const poolAddr = (snap.pool_address || '').toString().toLowerCase();
    if (!poolAddr || poolAddr.length < 10) return -1;
    const existing = this.db.prepare(`SELECT id FROM opportunity_snapshots WHERE pool_address = ? AND ts = ?`).get(poolAddr, snap.ts) as any;
    if (existing) {
      this.db.prepare(`UPDATE opportunity_snapshots SET liquidity_score = COALESCE(?, liquidity_score), fee_score = COALESCE(?, fee_score), risk_score = COALESCE(?, risk_score), capital_efficiency_score = COALESCE(?, capital_efficiency_score), opportunity_score = COALESCE(?, opportunity_score) WHERE id = ?`).run(
        snap.liquidity_score, snap.fee_score, snap.risk_score, snap.capital_efficiency_score, snap.opportunity_score, existing.id
      );
      return existing.id;
    }
    const info = this.db.prepare(`INSERT INTO opportunity_snapshots(pool_address, network, token0_symbol, token1_symbol, source, provenance, ts, liquidity_score, fee_score, risk_score, capital_efficiency_score, opportunity_score) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      poolAddr, snap.network, snap.token0_symbol, snap.token1_symbol, snap.source, snap.provenance, snap.ts, snap.liquidity_score, snap.fee_score, snap.risk_score, snap.capital_efficiency_score, snap.opportunity_score
    );
    return Number(info.lastInsertRowid);
  }
  getLatestSnapshots(network?: string): any[] {
    const db = (this as any).db;
    const rows = db.prepare(`SELECT * FROM opportunity_snapshots WHERE ts = (SELECT MAX(ts) FROM opportunity_snapshots WHERE pool_address = opportunity_snapshots.pool_address) AND pool_address <> '' ${network ? 'AND network = ?' : ''} ORDER BY opportunity_score DESC`).all(network ?? null);
    return rows;
  }
}
