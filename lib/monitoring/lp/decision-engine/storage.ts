import Database from 'better-sqlite3';
import { join } from 'path';

const DB_PATH = join(process.cwd(), 'lib/monitoring/lp/decision-engine/decision.db');

export type DecisionReport = {
  timestamp: number;
  portfolio: {
    current_position: any;
    current_pool: any;
    portfolio_health: string;
    portfolio_rank: number;
    portfolio_percentile: number;
    portfolio_value: number;
    portfolio_pnl: number;
    lp_alpha: number;
    fees: number;
  };
  market_context: {
    macro_regime: any;
    market_regime: any;
    crypto_regime: any;
    tokenization_regime: any;
    liquidity_regime: any;
  };
  opportunity: {
    opportunity_score: number;
    liquidity_score: number;
    fee_score: number;
    risk_score: number;
    capital_efficiency: number;
    ranking_position: number;
    ranking_percentile: number;
  };
  risk: {
    overall_risk: string;
    primary_risks: string[];
    confidence: number;
  };
  status: {
    status: string;
    status_reason: string;
    watch_items: string[];
  };
  provenance: {
    timestamp: number;
    sources: string[];
    freshness: Record<string, number>;
  };
  explainability: {
    triggered_rules: string[];
    metrics_used: string[];
    modules_used: string[];
  };
};

export type Rule = {
  id: string;
  name: string;
  description: string;
  priority: number;
  condition: (ctx: any) => boolean;
  result: string;
};

export class DecisionStorage {
  private db: any;
  constructor() {
    this.db = new Database(DB_PATH);
    this.migrate();
  }
  private migrate() {
    this.db.exec(`CREATE TABLE IF NOT EXISTS schema_version(version INTEGER PRIMARY KEY, applied_at TEXT)`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS decision_snapshots(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER UNIQUE,
      report_json TEXT,
      status TEXT,
      triggered_rules TEXT,
      provenance_json TEXT
    )`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_decision_ts ON decision_snapshots(ts DESC)`);
  }
  upsert(report: DecisionReport): number {
    const info = this.db.prepare(`
      INSERT OR REPLACE INTO decision_snapshots(ts, report_json, status, triggered_rules, provenance_json)
      VALUES(?,?,?,?,?)
    `).run(
      report.timestamp,
      JSON.stringify(report),
      report.status.status,
      JSON.stringify(report.explainability.triggered_rules),
      JSON.stringify(report.provenance)
    );
    return Number(info.lastInsertRowid);
  }
  getLatest(): DecisionReport | null {
    const row = this.db.prepare(`SELECT report_json FROM decision_snapshots ORDER BY ts DESC LIMIT 1`).get() as any;
    if (!row) return null;
    return JSON.parse(row.report_json);
  }
  list(limit = 100): DecisionReport[] {
    const rows = this.db.prepare(`SELECT report_json FROM decision_snapshots ORDER BY ts DESC LIMIT ?`).all(limit) as any[];
    return rows.map(r => JSON.parse(r.report_json));
  }
}