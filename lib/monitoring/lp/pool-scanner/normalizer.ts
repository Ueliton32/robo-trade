export type NormalizedPool = {
  network: string;
  protocol: string;
  dex: string;
  pool_address: string;
  token0_address: string;
  token1_address: string;
  token0_symbol?: string;
  token1_symbol?: string;
  fee_tier?: number;
  tvl?: number;
  volume_24h?: number;
  volume_7d?: number;
  volume_30d?: number;
  price?: number;
  price_change_24h?: number;
  transactions_24h?: number;
  liquidity?: number;
  market_cap?: number;
  fdv?: number;
  apr?: number;
  rewards_apr?: number;
  pool_created_at?: number;
  source: string;
  provenance: string;
  timestamp_ms: number;
};

export function normalizePool(raw: any, source: string): NormalizedPool {
  const addr = (s?: string) => s?.toLowerCase() ?? '';
  return {
    network: String(raw.network ?? ''),
    protocol: String(raw.protocol ?? ''),
    dex: String(raw.dex ?? raw.exchange ?? 'uniswapv3'),
    pool_address: addr(raw.address ?? raw.pool_address ?? raw.pool) ?? '',
    token0_address: addr(raw.token0 ?? raw.token0_address) ?? '',
    token1_address: addr(raw.token1 ?? raw.token1_address) ?? '',
    token0_symbol: raw.token0_symbol ?? raw.token0 ?? undefined,
    token1_symbol: raw.token1_symbol ?? raw.token1 ?? undefined,
    fee_tier: raw.fee_tier ? Number(raw.fee_tier) : undefined,
    tvl: raw.tvl_usd ?? raw.tvl ?? undefined,
    volume_24h: raw.volume_usd ?? raw.volume_24h ?? undefined,
    volume_7d: raw.volume_7d ?? undefined,
    volume_30d: raw.volume_30d ?? undefined,
    price: raw.price ? Number(raw.price) : undefined,
    price_change_24h: raw.price_change_24h ? Number(raw.price_change_24h) : undefined,
    transactions_24h: raw.transactions_24h ? Number(raw.transactions_24h) : undefined,
    liquidity: raw.liquidity ? Number(raw.liquidity) : undefined,
    market_cap: raw.market_cap ? Number(raw.market_cap) : undefined,
    fdv: raw.fdv ? Number(raw.fdv) : undefined,
    apr: raw.apr ? Number(raw.apr) : undefined,
    rewards_apr: raw.rewards_apr ? Number(raw.rewards_apr) : undefined,
    pool_created_at: raw.pool_created_at ?? raw.created_at ? Number(raw.pool_created_at ?? raw.created_at) : undefined,
    source,
    provenance: source === 'revert' ? 'DIRECT_INDEXER' : 'DERIVED',
    timestamp_ms: Date.now()
  };
}

export function deduplicate(pools: NormalizedPool[]): NormalizedPool[] {
  const seen = new Map<string, NormalizedPool>();
  for (const p of pools) {
    const key = `${p.network}:${p.pool_address}`;
    if (!seen.has(key)) {
      seen.set(key, p);
    } else {
      const existing = seen.get(key)!;
      seen.set(key, { ...existing, ...p, timestamp_ms: Math.max(existing.timestamp_ms, p.timestamp_ms) });
    }
  }
  return Array.from(seen.values());
}
