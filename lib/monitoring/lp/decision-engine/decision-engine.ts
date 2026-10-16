import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync } from 'fs';
import { DecisionStorage } from './storage';
import { RuleEngine } from './rule-engine';

const SNAPSHOT_DB = join(process.cwd(), 'lib/monitoring/lp/v13/snapshots.db');
const POOL_DB = join(process.cwd(), 'lib/monitoring/lp/pool-scanner/pools.db');
const OPP_DB = join(process.cwd(), 'lib/monitoring/lp/opportunity-engine/opportunity.db');
const CROSS_DB = join(process.cwd(), 'lib/monitoring/lp/cross-market-intelligence/cross-market.db');

function readLatestSnapshot(): any {
  if (!existsSync(SNAPSHOT_DB)) return null;
  const db = new Database(SNAPSHOT_DB);
  const row = db.prepare(`
    SELECT s.* FROM snapshots s
    JOIN positions p ON s.position_fk = p.id
    ORDER BY s.ts DESC LIMIT 1
  `).get() as any;
  return row || null;
}

function readLatestPool(): any {
  if (!existsSync(POOL_DB)) return null;
  const db = new Database(POOL_DB);
  const pool = db.prepare(`SELECT * FROM pools ORDER BY last_seen_ms DESC LIMIT 1`).get() as any;
  if (!pool) return null;
  const snapshots = db.prepare(`
    SELECT * FROM pool_snapshots WHERE pool_fk = ? ORDER BY ts DESC LIMIT 1
  `).get(pool.id) as any;
  return { pool, snapshot: snapshots };
}

function readLatestOpportunity(): any {
  if (!existsSync(OPP_DB)) return null;
  const db = new Database(OPP_DB);
  const row = db.prepare(`
    SELECT * FROM opportunity_snapshots ORDER BY ts DESC LIMIT 1
  `).get() as any;
  return row || null;
}

function readLatestCross(): any {
  if (!existsSync(CROSS_DB)) return null;
  const db = new Database(CROSS_DB);
  const row = db.prepare(`SELECT * FROM regime_snapshots ORDER BY ts DESC LIMIT 1`).get() as any;
  return row || null;
}

export class DecisionEngine {
  private storage: DecisionStorage;
  private ruleEngine: RuleEngine;

  constructor() {
    this.storage = new DecisionStorage();
    this.ruleEngine = new RuleEngine();
  }

  run(): any {
    const ts = Math.floor(Date.now() / 1000);

    const snapshot = readLatestSnapshot();
    const poolLatest = readLatestPool();
    const opp = readLatestOpportunity();
    const cross = readLatestCross();

    const portfolio_value = snapshot?.value_usd ?? 0;
    const portfolio_pnl = snapshot?.lp_net_pnl ?? 0;
    const lp_alpha = snapshot?.lp_alpha_usd ?? 0;
    const lp_alpha_pct = snapshot?.lp_alpha_pct ?? 0;
    const fees = snapshot?.fees_total ?? 0;
    const in_range = snapshot ? Boolean(snapshot.in_range) : false;

    const portfolio = {
      current_position: snapshot ? {
        position_id: snapshot.position_fk,
        in_range,
        tick_lower: snapshot.tick_lower,
        tick_upper: snapshot.tick_upper,
        current_tick: snapshot.current_tick
      } : null,
      current_pool: poolLatest?.pool ?? null,
      portfolio_health: lp_alpha_pct > 0 ? 'HEALTHY' : lp_alpha_pct < -5 ? 'UNHEALTHY' : 'NEUTRAL',
      portfolio_rank: 0,
      portfolio_percentile: 0,
      portfolio_value,
      portfolio_pnl,
      lp_alpha: lp_alpha_pct,
      fees
    };

    const market_context = {
      macro_regime: cross ? {
        state: cross.macro_state,
        confidence: cross.macro_confidence,
        factors: JSON.parse(cross.macro_factors || '{}'),
        provenance: cross.macro_provenance
      } : null,
      market_regime: cross ? {
        state: cross.market_state,
        confidence: cross.market_confidence,
        factors: JSON.parse(cross.market_factors || '{}'),
        provenance: cross.market_provenance
      } : null,
      crypto_regime: cross ? {
        state: cross.crypto_state,
        confidence: cross.crypto_confidence,
        factors: JSON.parse(cross.crypto_factors || '{}'),
        provenance: cross.crypto_provenance
      } : null,
      tokenization_regime: cross ? {
        state: cross.tokenization_state,
        confidence: cross.tokenization_confidence,
        factors: JSON.parse(cross.tokenization_factors || '{}'),
        provenance: cross.tokenization_provenance
      } : null,
      liquidity_regime: cross ? {
        state: cross.liquidity_state,
        confidence: cross.liquidity_confidence,
        factors: JSON.parse(cross.liquidity_factors || '{}'),
        provenance: cross.liquidity_provenance
      } : null
    };

    const opportunity = {
      opportunity_score: opp?.opportunity_score ?? 0,
      liquidity_score: opp?.liquidity_score ?? 0,
      fee_score: opp?.fee_score ?? 0,
      risk_score: opp?.risk_score ?? 0,
      capital_efficiency: opp?.capital_efficiency_score ?? 0,
      ranking_position: 0,
      ranking_percentile: 0
    };

    const risk_overall = (opportunity.risk_score ?? 0) > 70 ? 'HIGH' : (opportunity.risk_score ?? 0) > 40 ? 'MEDIUM' : 'LOW';
    const primary_risks: string[] = [];
    if (!in_range) primary_risks.push('Out of range');
    if ((opp?.risk_score ?? 0) > 70) primary_risks.push('High risk score');
    if (market_context.macro_regime?.state === 'BEARISH') primary_risks.push('Bearish macro');

    const ctx = { portfolio: { lp_alpha_pct, in_range }, opportunity, market_context };
    const evaluations = this.ruleEngine.evaluate(ctx);

    const triggered = evaluations.filter(e => e.result === 'PASS');
    const triggered_rules = triggered.map(t => t.id);

    const statusPriority = [ 'UNHEALTHY', 'STRONG_CANDIDATE', 'ROTATE_CANDIDATE', 'REVIEW', 'WATCH', 'HEALTHY' ];
    let status = 'HEALTHY';
    let status_reason = 'No rules triggered';

    for (const rule of this.ruleEngine.getRules()) {
      const ev = evaluations.find(e => e.id === rule.id);
      if (ev?.result === 'PASS') {
        if (statusPriority.indexOf(rule.result) < statusPriority.indexOf(status)) {
          status = rule.result;
          status_reason = rule.description;
        }
      }
    }

    const watch_items = triggered
      .filter(t => ['WATCH', 'REVIEW'].includes(this.ruleEngine.getRules().find(r => r.id === t.id)?.result || ''))
      .map(t => t.name);

    const confidence = this.computeConfidence(triggered.length, evaluations.length, cross, opp, snapshot);

    const report = {
      timestamp: ts,
      portfolio,
      market_context,
      opportunity,
      risk: {
        overall_risk: risk_overall,
        primary_risks,
        confidence
      },
      status: {
        status,
        status_reason,
        watch_items
      },
      provenance: {
        timestamp: ts,
        sources: ['Portfolio Monitor', 'Pool Scanner', 'Opportunity Engine', 'Cross Market Intelligence'],
        freshness: {
          portfolio: snapshot ? ts - (snapshot.ts || ts) : -1,
          pool: poolLatest?.snapshot ? ts - (poolLatest.snapshot.ts || ts) : -1,
          opportunity: opp ? ts - (opp.ts || ts) : -1,
          cross: cross ? ts - (cross.ts || ts) : -1
        }
      },
      explainability: {
        triggered_rules,
        metrics_used: triggered.flatMap(t => {
          const rule = this.ruleEngine.getRules().find(r => r.id === t.id);
          return rule?.metrics || [];
        }),
        modules_used: ['Portfolio Monitor', 'Pool Scanner', 'Opportunity Engine', 'Cross Market Intelligence']
      }
    };

    this.storage.upsert(report as any);
    return report;
  }

  private computeConfidence(triggered: number, total: number, cross: any, opp: any, snapshot: any): number {
    let conf = 50;
    if (snapshot) conf += 20;
    if (opp) conf += 15;
    if (cross) conf += 15;
    conf = Math.min(100, Math.max(0, conf));
    return conf;
  }
}