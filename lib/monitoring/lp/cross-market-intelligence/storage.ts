import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'lib/monitoring/lp/cross-market-intelligence/cross-market.db');

export type RegimeSnapshot = {
  id?: number;
  macro: RegimeData;
  market: RegimeData;
  crypto: RegimeData;
  tokenization: RegimeData;
  liquidity: RegimeData;
  ts: number; // Unix seconds
};

export type RegimeData = {
  state: string;
  confidence: number; // 0-100
  factors: Record<string, any>;
  provenance: string;
};

export class CrossMarketStorage {
  private db: any;
  constructor() {
    this.db = new Database(DB_PATH);
    this.migrate();
  }
  private migrate() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY, applied_at TEXT)`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS regime_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        macro_state TEXT,
        macro_confidence INTEGER,
        macro_factors TEXT, -- JSON
        macro_provenance TEXT,
        market_state TEXT,
        market_confidence INTEGER,
        market_factors TEXT,
        market_provenance TEXT,
        crypto_state TEXT,
        crypto_confidence INTEGER,
        crypto_factors TEXT,
        crypto_provenance TEXT,
        tokenization_state TEXT,
        tokenization_confidence INTEGER,
        tokenization_factors TEXT,
        tokenization_provenance TEXT,
        liquidity_state TEXT,
        liquidity_confidence INTEGER,
        liquidity_factors TEXT,
        liquidity_provenance TEXT,
        ts INTEGER
      )
    `);
  }
  upsertSnapshot(snap: RegimeSnapshot): number {
    const existing = this.db.prepare(`SELECT id FROM regime_snapshots WHERE ts = ?`).get(snap.ts) as any;
    if (existing) {
      this.db.prepare(`
        UPDATE regime_snapshots SET
          macro_state = ?, macro_confidence = ?, macro_factors = ?, macro_provenance = ?,
          market_state = ?, market_confidence = ?, market_factors = ?, market_provenance = ?,
          crypto_state = ?, crypto_confidence = ?, crypto_factors = ?, crypto_provenance = ?,
          tokenization_state = ?, tokenization_confidence = ?, tokenization_factors = ?, tokenization_provenance = ?,
          liquidity_state = ?, liquidity_confidence = ?, liquidity_factors = ?, liquidity_provenance = ?
        WHERE id = ?
      `).run(
        snap.macro.state, snap.macro.confidence, JSON.stringify(snap.macro.factors), snap.macro.provenance,
        snap.market.state, snap.market.confidence, JSON.stringify(snap.market.factors), snap.market.provenance,
        snap.crypto.state, snap.crypto.confidence, JSON.stringify(snap.crypto.factors), snap.crypto.provenance,
        snap.tokenization.state, snap.tokenization.confidence, JSON.stringify(snap.tokenization.factors), snap.tokenization.provenance,
        snap.liquidity.state, snap.liquidity.confidence, JSON.stringify(snap.liquidity.factors), snap.liquidity.provenance,
        existing.id
      );
      return existing.id;
    }
    const info = this.db.prepare(`
      INSERT INTO regime_snapshots(
        macro_state, macro_confidence, macro_factors, macro_provenance,
        market_state, market_confidence, market_factors, market_provenance,
        crypto_state, crypto_confidence, crypto_factors, crypto_provenance,
        tokenization_state, tokenization_confidence, tokenization_factors, tokenization_provenance,
        liquidity_state, liquidity_confidence, liquidity_factors, liquidity_provenance,
        ts
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      snap.macro.state, snap.macro.confidence, JSON.stringify(snap.macro.factors), snap.macro.provenance,
      snap.market.state, snap.market.confidence, JSON.stringify(snap.market.factors), snap.market.provenance,
      snap.crypto.state, snap.crypto.confidence, JSON.stringify(snap.crypto.factors), snap.crypto.provenance,
      snap.tokenization.state, snap.tokenization.confidence, JSON.stringify(snap.tokenization.factors), snap.tokenization.provenance,
      snap.liquidity.state, snap.liquidity.confidence, JSON.stringify(snap.liquidity.factors), snap.liquidity.provenance,
      snap.ts
    );
    return Number(info.lastInsertRowid);
  }
  getLatestSnapshot(): RegimeSnapshot | null {
    const row = this.db.prepare(`SELECT * FROM regime_snapshots ORDER BY ts DESC LIMIT 1`).get();
    if (!row) return null;
    return {
      macro: {
        state: row.macro_state,
        confidence: row.macro_confidence,
        factors: JSON.parse(row.macro_factors),
        provenance: row.macro_provenance
      },
      market: {
        state: row.market_state,
        confidence: row.market_confidence,
        factors: JSON.parse(row.market_factors),
        provenance: row.market_provenance
      },
      crypto: {
        state: row.crypto_state,
        confidence: row.crypto_confidence,
        factors: JSON.parse(row.crypto_factors),
        provenance: row.crypto_provenance
      },
      tokenization: {
        state: row.tokenization_state,
        confidence: row.tokenization_confidence,
        factors: JSON.parse(row.tokenization_factors),
        provenance: row.tokenization_provenance
      },
      liquidity: {
        state: row.liquidity_state,
        confidence: row.liquidity_confidence,
        factors: JSON.parse(row.liquidity_factors),
        provenance: row.liquidity_provenance
      },
      ts: row.ts
    };
  }
}
