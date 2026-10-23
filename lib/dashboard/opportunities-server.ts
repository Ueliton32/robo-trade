import Database from 'better-sqlite3';
import { join } from 'path';

const POOL_DB = join(process.cwd(), 'lib/monitoring/lp/pool-scanner/pools.db');
const OPPORTUNITY_DB = join(process.cwd(), 'lib/monitoring/lp/opportunity-engine/opportunity.db');

export type OpportunityPool = {
  poolAddress: string;
  network: string;
  protocol: string;
  dex: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Address: string;
  token1Address: string;
  feeTier: number | null;
  firstSeenMs: number | null;
  lastSeenMs: number | null;
  source: string;
  provenance: string;
  snapshotTs: number | null;
  opportunityTs: number | null;
  opportunityScore: number | null;
  liquidityScore: number | null;
  feeScore: number | null;
  riskScore: number | null;
  capitalEfficiencyScore: number | null;
  tvl: number | null;
  volume24h: number | null;
  volume7d: number | null;
  volume30d: number | null;
  liquidity: number | null;
  apr: number | null;
  rewardsApr: number | null;
  poolScore: number | null;
  priceChange24h: number | null;
};

export type OpportunityDiscoveryData = {
  pools: OpportunityPool[];
  networks: string[];
  protocols: string[];
  latestSnapshotTs: number | null;
};

type RawPool = {
  id: number;
  network: string;
  protocol: string;
  dex: string;
  pool_address: string;
  token0_address: string;
  token1_address: string;
  token0_symbol: string | null;
  token1_symbol: string | null;
  fee_tier: number | null;
  first_seen_ms: number | null;
  last_seen_ms: number | null;
  source: string;
  provenance: string;
  snapshot_ts: number | null;
  tvl: number | null;
  volume_24h: number | null;
  volume_7d: number | null;
  volume_30d: number | null;
  liquidity: number | null;
  apr: number | null;
  rewards_apr: number | null;
  pool_score: number | null;
  price_change_24h: number | null;
};

type RawOpportunity = {
  pool_address: string;
  network: string;
  token0_symbol: string | null;
  token1_symbol: string | null;
  ts: number | null;
  liquidity_score: number | null;
  fee_score: number | null;
  risk_score: number | null;
  capital_efficiency_score: number | null;
  opportunity_score: number | null;
};

export function getOpportunityDiscoveryData(): OpportunityDiscoveryData {
  const poolDb = new Database(POOL_DB, { readonly: true, fileMustExist: true });
  const opportunityDb = new Database(OPPORTUNITY_DB, { readonly: true, fileMustExist: true });

  try {
    const poolRows = poolDb.prepare(`
      SELECT
        p.*,
        s.ts AS snapshot_ts,
        s.tvl,
        s.volume_24h,
        s.volume_7d,
        s.volume_30d,
        s.liquidity,
        s.apr,
        s.rewards_apr,
        s.pool_score,
        s.price_change_24h
      FROM pools p
      LEFT JOIN pool_snapshots s ON s.id = (
        SELECT ps.id
        FROM pool_snapshots ps
        WHERE ps.pool_fk = p.id
        ORDER BY ps.ts DESC, ps.id DESC
        LIMIT 1
      )
      WHERE p.pool_address IS NOT NULL AND p.pool_address <> ''
    `).all() as RawPool[];

    const opportunityRows = opportunityDb.prepare(`
      WITH latest AS (
        SELECT pool_address, MAX(ts) AS max_ts
        FROM opportunity_snapshots
        WHERE pool_address IS NOT NULL AND pool_address <> '' AND ts IS NOT NULL
        GROUP BY pool_address
      )
      SELECT o.*
      FROM opportunity_snapshots o
      JOIN latest l ON l.pool_address = o.pool_address AND l.max_ts = o.ts
    `).all() as RawOpportunity[];

    const opportunityByAddress = new Map(opportunityRows.map((row) => [row.pool_address.toLowerCase(), row]));

    const pools = poolRows.map((pool): OpportunityPool => {
      const opportunity = opportunityByAddress.get(pool.pool_address.toLowerCase());
      return {
        poolAddress: pool.pool_address,
        network: pool.network,
        protocol: pool.protocol,
        dex: pool.dex,
        token0Symbol: opportunity?.token0_symbol ?? pool.token0_symbol ?? 'Token 0',
        token1Symbol: opportunity?.token1_symbol ?? pool.token1_symbol ?? 'Token 1',
        token0Address: pool.token0_address,
        token1Address: pool.token1_address,
        feeTier: pool.fee_tier,
        firstSeenMs: pool.first_seen_ms,
        lastSeenMs: pool.last_seen_ms,
        source: pool.source,
        provenance: opportunity ? 'DERIVED + DIRECT_INDEXER' : pool.provenance,
        snapshotTs: pool.snapshot_ts,
        opportunityTs: opportunity?.ts ?? null,
        opportunityScore: opportunity?.opportunity_score ?? null,
        liquidityScore: opportunity?.liquidity_score ?? null,
        feeScore: opportunity?.fee_score ?? null,
        riskScore: opportunity?.risk_score ?? null,
        capitalEfficiencyScore: opportunity?.capital_efficiency_score ?? null,
        tvl: pool.tvl,
        volume24h: pool.volume_24h,
        volume7d: pool.volume_7d,
        volume30d: pool.volume_30d,
        liquidity: pool.liquidity,
        apr: pool.apr,
        rewardsApr: pool.rewards_apr,
        poolScore: pool.pool_score,
        priceChange24h: pool.price_change_24h,
      };
    }).sort((a, b) => (b.opportunityScore ?? -1) - (a.opportunityScore ?? -1));

    return {
      pools,
      networks: [...new Set(pools.map((pool) => pool.network))].sort(),
      protocols: [...new Set(pools.map((pool) => pool.protocol))].sort(),
      latestSnapshotTs: pools.reduce<number | null>((latest, pool) => pool.snapshotTs && (!latest || pool.snapshotTs > latest) ? pool.snapshotTs : latest, null),
    };
  } finally {
    poolDb.close();
    opportunityDb.close();
  }
}

export function getOpportunityPool(address: string): OpportunityPool | null {
  return getOpportunityDiscoveryData().pools.find((pool) => pool.poolAddress.toLowerCase() === address.toLowerCase()) ?? null;
}
