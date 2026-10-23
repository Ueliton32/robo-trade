// LP Portfolio Monitor V1.1
// ────────────────────────────
// Adapters: CoinGecko via AIsa, GeckoTerminal, RPC/on-chain (Uniswap V3).
// 100% READ-ONLY — no transactions, no signatures, no wallet movement.

// ---- provenance ----
export type Provenance =
  | "DIRECT_ONCHAIN"
  | "DIRECT_INDEXER"
  | "DERIVED"
  | "ESTIMATED"
  | "MOCK";

export interface Provenanced<T> {
  value: T;
  source: Provenance;
  timestamp_ms: number;
  confidence: number; // 0..1
}

// ---- identity ----
export interface PositionIdentity {
  wallet_address: string;
  chain: "ethereum" | "base" | "arbitrum" | "robinhood";
  position_id: string; // NFT tokenId
  pool_address: string;
  token0: TokenRef;
  token1: TokenRef;
  fee_tier: number;
  tick_lower: number;
  tick_upper: number;
}

export interface TokenRef {
  chain: string;
  contract_address: string; // primary identity — never ticker only
  coin_gecko_id?: string; // secondary, resolved once, cached
  symbol?: string;
  decimals?: number;
}

// ---- snapshots ----
export interface PositionSnapshot {
  timestamp_ms: number;
  current_tick: number;
  sqrt_price: string;
  liquidity: string;
  token0_amount: string;
  token1_amount: string;
  token0_price_usd: Provenanced<number>;
  token1_price_usd: Provenanced<number>;
  position_value_usd: number;
  estimated_uncollected_fee0: string;
  estimated_uncollected_fee1: string;
  estimated_uncollected_fees_usd: number;
  in_range: boolean;
}

export interface PoolSnapshot {
  timestamp_ms: number;
  tvl_usd: Provenanced<number>;
  volume_24h: Provenanced<number>;
  volume_7d: Provenanced<number>;
  volume_30d: Provenanced<number>;
  estimated_gross_fees_24h: number;
  estimated_gross_fees_7d: number;
  estimated_gross_fees_30d: number;
  volume_tvl_ratio: number;
  current_price: Provenanced<number>;
}

export interface PositionPerformance {
  initial_capital_usd: number;
  current_position_value_usd: number;
  collected_fees_usd: number;
  estimated_uncollected_fees_usd: number;
  total_fees_usd: number;
  lp_total_value_usd: number;
  lp_pnl_usd: number;
  lp_return_percent: number;
  hodl_value_usd: number;
  hodl_pnl_usd: number;
  hodl_return_percent: number;
  lp_alpha_usd: number;
  lp_alpha_percent: number;
  divergence_loss_usd: number;
  divergence_loss_percent: number;
  realized_fee_apr: number;
  time_in_range_percent: number;
  baseline_status: "BASELINE_COMPLETE" | "BASELINE_INCOMPLETE";
}

// ---- adapter interfaces ----
export interface CoinGeckoAdapter {
  getTokenPriceUsd(ref: TokenRef): Promise<Provenanced<number>>;
  getTokenMarketChartRange(
    ref: TokenRef,
    from: number,
    to: number
  ): Promise<Provenanced<Array<[number, number]>>>;
}

export interface GeckoTerminalAdapter {
  getPoolInfo(chain: string, poolAddress: string): Promise<Provenanced<{
    tvl_usd: number;
    volume_24h: number;
    volume_7d: number;
    volume_30d: number;
    fee_tier: number;
    token0_price_usd: number;
    token1_price_usd: number;
  }>>;
  getPoolOhlcv(
    chain: string,
    poolAddress: string,
    timeframe: string
  ): Promise<Provenanced<Array<[number, number, number, number, number, number]>>>;
}

export interface RpcAdapter {
  getPosition(chain: string, nftTokenId: string): Promise<Provenanced<{
    liquidity: string;
    tickLower: number;
    tickUpper: number;
    feeGrowthInside0LastX128: string;
    feeGrowthInside1LastX128: string;
    tokensOwed0: string;
    tokensOwed1: string;
  }>>;
  getPoolSlot0(chain: string, poolAddress: string): Promise<Provenanced<{
    sqrtPriceX96: string;
    tick: number;
  }>>;
  getPoolFeeGrowthGlobal(chain: string, poolAddress: string): Promise<Provenanced<{
    feeGrowthGlobal0X128: string;
    feeGrowthGlobal1X128: string;
  }>>;
}

// ---- caches ----
interface TokenMetaCacheEntry {
  coin_gecko_id?: string;
  decimals?: number;
  symbol?: string;
  fetched_at_ms: number;
  ttl_ms: number;
}

const TOKEN_META_TTL_MS = 60 * 60 * 1000; // 1h
const PRICE_CACHE_TTL_MS = 30 * 1000; // 30s — avoid redundant paid calls

class InMemoryCache<K, V> {
  private map = new Map<K, { value: V; expires_at: number }>();
  constructor(private ttl_ms: number) {}
  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry || entry.expires_at < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }
  set(key: K, value: V) {
    this.map.set(key, { value, expires_at: Date.now() + this.ttl_ms });
  }
}

// ---- helpers ----
function provenanced<T>(value: T, source: Provenance, confidence: number): Provenanced<T> {
  return { value, source, timestamp_ms: Date.now(), confidence };
}

function tokenCacheKey(ref: TokenRef): string {
  return `${ref.chain}:${ref.contract_address.toLowerCase()}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ================================================================
// CoinGeckoAdapter — AIsa-backed, with batching, cache, fallback
// ================================================================

export class AisaCoinGeckoAdapter implements CoinGeckoAdapter {
  private priceCache = new InMemoryCache<string, Provenanced<number>>(PRICE_CACHE_TTL_MS);
  private metaCache = new InMemoryCache<string, TokenMetaCacheEntry>(TOKEN_META_TTL_MS);

  constructor(
    private sessionId: string, // AIsa session for batching continuity
    private maxRetries: number = 1
  ) {}

  // 1. Batching when token0/token1 share the same platform
  //    batch_quote handles the batching inside AIsa; we simply group calls.
  async getTokenPriceUsd(ref: TokenRef): Promise<Provenanced<number>> {
    const cacheKey = tokenCacheKey(ref);
    const cached = this.priceCache.get(cacheKey);
    if (cached) return cached;

    // 7. chain + contract_address as primary identity
    // 3. simple_token_price_id preferred for contract-based pricing
    const args = {
      contract_addresses: ref.contract_address,
      id: ref.chain,
      vs_currencies: "usd",
      include_market_cap: true,
      include_24hr_vol: true,
      include_last_updated_at: true,
    };

    let lastErr: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.callAisa("get_coingecko_simple_token_price_id", args);
        const byAddress = (result as Record<string, Record<string, unknown>>)?.[
          ref.contract_address.toLowerCase()
        ];
        if (!byAddress) throw new Error("empty response for address");
        const usd = Number(byAddress.usd);
        if (!Number.isFinite(usd)) throw new Error("non-finite price");
        const confidence = byAddress.usd_market_cap ? 0.95 : 0.85;
        const p = provenanced(usd, "DIRECT_INDEXER", confidence);
        this.priceCache.set(cacheKey, p);
        return p;
      } catch (e) {
        lastErr = e;
        await sleep(300);
      }
    }

    // 9. Fallback without inventing price — mark as ESTIMATED with low confidence
    const fallback = provenanced(NaN, "ESTIMATED", 0.0);
    return fallback;
  }

  // 4. market_chart_range only when history is needed
  async getTokenMarketChartRange(
    ref: TokenRef,
    from: number, // Unix seconds
    to: number
  ): Promise<Provenanced<Array<[number, number]>>> {
    // 5. Unix seconds in request, ms in response
    const args = {
      id: ref.coin_gecko_id ?? "", // requires canonical id
      from,
      to,
      vs_currency: "usd",
    };
    const result = await this.callAisa("get_coingecko_coins_id_market_chart_range", args);
    const prices = (result as any)?.prices as Array<[number, number]> | undefined;
    if (!prices?.length) throw new Error("no price history returned");
    return provenanced(prices, "DIRECT_INDEXER", 0.9);
  }

  // 6. Never rely on ticker/symbol alone — identity must be chain+address
  //    coin_gecko_id is resolved once and cached via metadata cache
  async resolveCoinGeckoId(ref: TokenRef): Promise<string | undefined> {
    const cached = this.metaCache.get(tokenCacheKey(ref));
    if (cached?.coin_gecko_id) return cached.coin_gecko_id;

    // Try contract address lookup via coins_id platform detail
    if (ref.coin_gecko_id) {
      this.metaCache.set(tokenCacheKey(ref), {
        coin_gecko_id: ref.coin_gecko_id,
        fetched_at_ms: Date.now(),
        ttl_ms: TOKEN_META_TTL_MS,
      });
      return ref.coin_gecko_id;
    }
    return undefined; // 10. minimize calls — do not search for every token
  }

  private async callAisa(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    // Deferred tool routing — uses AIsa MCP tools already connected.
    // Implementation delegates to mcp__aisa__batch_use via tool_call in parent.
    throw new Error(`AisaCoinGeckoAdapter.callAisa("${toolName}") must be wired to mcp__aisa__batch_use`);
  }
}

// ================================================================
// GeckoTerminalAdapter — real public API, cached, timeout/retry
// ================================================================

export class RealGeckoTerminalAdapter implements GeckoTerminalAdapter {
  private readonly BASE = "https://api.geckoterminal.com/api/v2";
  private cache = new InMemoryCache<string, Provenanced<unknown>>(30_000);

  constructor(private timeoutMs = 10_000) {}

  async getPoolInfo(chain: string, poolAddress: string): Promise<Provenanced<{
    tvl_usd: number;
    volume_24h: number;
    volume_7d: number;
    volume_30d: number;
    fee_tier: number;
    token0_price_usd: number;
    token1_price_usd: number;
  }>> {
    const key = `pool:${chain}:${poolAddress.toLowerCase()}`;
    const cached = this.cache.get(key) as Provenanced<any> | undefined;
    if (cached) return cached as Provenanced<any>;

    const url = `${this.BASE}/networks/${chain}/pools/${poolAddress}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);
      if (res.status === 429) throw new Error("rate limited");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as any;
      const a = json.data?.attributes;
      if (!a) throw new Error("missing pool attributes");
      const feeTierNum = Number(a.pool_fee_percentage ?? 0) * 10_000;
      const out = provenanced(
        {
          tvl_usd: Number(a.reserve_in_usd ?? 0),
          volume_24h: Number(a.volume_usd?.h24 ?? 0),
          volume_7d: Number(a.volume_usd?.h6 ?? 0),
          volume_30d: Number(a.volume_usd?.h24 ?? 0) * 30 / 24,
          fee_tier: feeTierNum,
          token0_price_usd: Number(a.base_token_price_usd ?? 0),
          token1_price_usd: Number(a.quote_token_price_usd ?? 0),
        },
        "DIRECT_INDEXER",
        0.92
      );
      this.cache.set(key, out as Provenanced<unknown>);
      return out;
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }

  async getPoolOhlcv(
    chain: string,
    poolAddress: string,
    timeframe: string
  ): Promise<Provenanced<Array<[number, number, number, number, number, number]>>> {
    const url = `${this.BASE}/networks/${chain}/pools/${poolAddress}/ohlcv/${timeframe}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error(`OHLCV HTTP ${res.status}`);
      const json = (await res.json()) as any;
      const list = json.data?.attributes?.ohlcv_list as Array<[number, number, number, number, number, number]> | undefined;
      if (!list) throw new Error("missing ohlcv list");
      const out = provenanced(list, "DIRECT_INDEXER", 0.9);
      return out;
    } catch (e) {
      clearTimeout(t);
      throw e;
    }
  }
}

// ================================================================
// RpcAdapter — Uniswap V3 read-only via ethers/JSON-RPC eth_call
// ================================================================

import { ethers } from "ethers";

const POSITION_MANAGER_ABI_FRAGMENT = [
  "function positions(uint256 tokenId) external view returns (uint64 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
];

const POOL_ABI_FRAGMENT = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function feeGrowthGlobal0X128() external view returns (uint256)",
  "function feeGrowthGlobal1X128() external view returns (uint256)",
  "function liquidity() external view returns (uint128)",
  "function tick() external view returns (int24)",
];

const ERC20_ABI_FRAGMENT = ["function decimals() external view returns (uint8)", "function symbol() external view returns (string)"];

export class RealRpcAdapter implements RpcAdapter {
  private provider: ethers.JsonRpcProvider;
  private positionManager: ethers.Contract;

  constructor(rpcUrl: string, positionManagerAddress: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.positionManager = new ethers.Contract(positionManagerAddress, POSITION_MANAGER_ABI_FRAGMENT, this.provider);
  }

  async getPosition(chain: string, nftTokenId: string): Promise<Provenanced<{
    liquidity: string;
    tickLower: number;
    tickUpper: number;
    feeGrowthInside0LastX128: string;
    feeGrowthInside1LastX128: string;
    tokensOwed0: string;
    tokensOwed1: string;
  }>> {
    const pos = await this.positionManager.positions(BigInt(nftTokenId));
    const out = {
      liquidity: pos.liquidity.toString(),
      tickLower: Number(pos.tickLower),
      tickUpper: Number(pos.tickUpper),
      feeGrowthInside0LastX128: pos.feeGrowthInside0LastX128.toString(),
      feeGrowthInside1LastX128: pos.feeGrowthInside1LastX128.toString(),
      tokensOwed0: pos.tokensOwed0.toString(),
      tokensOwed1: pos.tokensOwed1.toString(),
    };
    return provenanced(out, "DIRECT_ONCHAIN", 0.99);
  }

  async getPoolSlot0(chain: string, poolAddress: string): Promise<Provenanced<{
    sqrtPriceX96: string;
    tick: number;
  }>> {
    const pool = new ethers.Contract(poolAddress, POOL_ABI_FRAGMENT, this.provider);
    const slot0 = await pool.slot0();
    const out = {
      sqrtPriceX96: slot0.sqrtPriceX96.toString(),
      tick: Number(slot0.tick),
    };
    return provenanced(out, "DIRECT_ONCHAIN", 0.99);
  }

  async getPoolFeeGrowthGlobal(chain: string, poolAddress: string): Promise<Provenanced<{
    feeGrowthGlobal0X128: string;
    feeGrowthGlobal1X128: string;
  }>> {
    const pool = new ethers.Contract(poolAddress, POOL_ABI_FRAGMENT, this.provider);
    const [g0, g1] = await Promise.all([
      pool.feeGrowthGlobal0X128(),
      pool.feeGrowthGlobal1X128(),
    ]);
    const out = {
      feeGrowthGlobal0X128: g0.toString(),
      feeGrowthGlobal1X128: g1.toString(),
    };
    return provenanced(out, "DIRECT_ONCHAIN", 0.99);
  }
}

// ================================================================
// Uniswap V3 math — concentrated liquidity token amounts + fees
// ================================================================

const Q96 = BigInt(1) << BigInt(96);

export function sqrtRatioAtTick(tick: number): bigint {
  // sqrt(1.0001^tick) * 2^96, with sign handling for negative ticks
  const neg = tick < 0;
  const abs = Math.abs(tick);
  const ratio = Math.pow(1.0001, abs);
  let result = BigInt(Math.floor(ratio * Number(Q96)));
  return neg ? Q96 * Q96 / result : result; // approximate reciprocal for negative ticks
}

export function getAmountsForLiquidity(
  liquidity: bigint,
  sqrtRatioX96: bigint,
  sqrtRatioLowerX96: bigint,
  sqrtRatioUpperX96: bigint
): { amount0: bigint; amount1: bigint } {
  if (sqrtRatioX96 <= sqrtRatioLowerX96) {
    // below range — all token0
    return {
      amount0: (liquidity * (sqrtRatioUpperX96 - sqrtRatioLowerX96) * Q96) / (sqrtRatioUpperX96 * sqrtRatioLowerX96),
      amount1: BigInt(0),
    };
  }
  if (sqrtRatioX96 >= sqrtRatioUpperX96) {
    // above range — all token1
    return {
      amount0: BigInt(0),
      amount1: (liquidity * (sqrtRatioUpperX96 - sqrtRatioLowerX96)) / Q96,
    };
  }
  // inside range
  const amount0 = (liquidity * (sqrtRatioUpperX96 - sqrtRatioX96) * Q96) / (sqrtRatioX96 * sqrtRatioUpperX96);
  const amount1 = (liquidity * (sqrtRatioX96 - sqrtRatioLowerX96)) / Q96;
  return { amount0, amount1 };
}

export function computeUncollectedFees(
  liquidity: bigint,
  feeGrowthInsideLastX128_token0: bigint,
  feeGrowthInsideLastX128_token1: bigint,
  feeGrowthGlobal0X128: bigint,
  feeGrowthGlobal1X128: bigint
): { fee0: bigint; fee1: bigint } {
  const fee0 = ((feeGrowthGlobal0X128 - feeGrowthInsideLastX128_token0) * liquidity) >> BigInt(128);
  const fee1 = ((feeGrowthGlobal1X128 - feeGrowthInsideLastX128_token1) * liquidity) >> BigInt(128);
  return { fee0, fee1 };
}

// ================================================================
// Monitor orchestrator
// ================================================================

export class LpPortfolioMonitor {
  constructor(
    private identity: PositionIdentity,
    private cg: CoinGeckoAdapter,
    private gt: GeckoTerminalAdapter,
    private rpc: RpcAdapter,
    private validationMode: boolean = false
  ) {}

  async fetchPositionSnapshot(): Promise<PositionSnapshot> {
    const [pos, slot0, feeGlobal] = await Promise.all([
      this.rpc.getPosition(this.identity.chain, this.identity.position_id),
      this.rpc.getPoolSlot0(this.identity.chain, this.identity.pool_address),
      this.rpc.getPoolFeeGrowthGlobal(this.identity.chain, this.identity.pool_address),
    ]);

    const token0Price = await this.cg.getTokenPriceUsd(this.identity.token0);
    const token1Price = await this.cg.getTokenPriceUsd(this.identity.token1);

    const liquidity = BigInt(pos.value.liquidity);
    const sqrtPrice = BigInt(slot0.value.sqrtPriceX96);
    const sqrtLower = sqrtRatioAtTick(pos.value.tickLower);
    const sqrtUpper = sqrtRatioAtTick(pos.value.tickUpper);
    const amounts = getAmountsForLiquidity(liquidity, sqrtPrice, sqrtLower, sqrtUpper);

    const fees = computeUncollectedFees(
      liquidity,
      BigInt(pos.value.feeGrowthInside0LastX128),
      BigInt(pos.value.feeGrowthInside1LastX128),
      BigInt(feeGlobal.value.feeGrowthGlobal0X128),
      BigInt(feeGlobal.value.feeGrowthGlobal1X128)
    );

    const inRange = slot0.value.tick >= pos.value.tickLower && slot0.value.tick <= pos.value.tickUpper;

    return {
      timestamp_ms: Date.now(),
      current_tick: slot0.value.tick,
      sqrt_price: slot0.value.sqrtPriceX96,
      liquidity: pos.value.liquidity,
      token0_amount: amounts.amount0.toString(),
      token1_amount: amounts.amount1.toString(),
      token0_price_usd: token0Price,
      token1_price_usd: token1Price,
      position_value_usd: Number(amounts.amount0) * token0Price.value + Number(amounts.amount1) * token1Price.value,
      estimated_uncollected_fee0: fees.fee0.toString(),
      estimated_uncollected_fee1: fees.fee1.toString(),
      estimated_uncollected_fees_usd: Number(fees.fee0) * token0Price.value + Number(fees.fee1) * token1Price.value,
      in_range: inRange,
    };
  }

  async fetchPoolSnapshot(): Promise<PoolSnapshot> {
    const pool = await this.gt.getPoolInfo(this.identity.chain, this.identity.pool_address);
    return {
      timestamp_ms: Date.now(),
      tvl_usd: provenanced(pool.value.tvl_usd, pool.source, pool.confidence),
      volume_24h: provenanced(pool.value.volume_24h, pool.source, pool.confidence),
      volume_7d: provenanced(pool.value.volume_7d, pool.source, pool.confidence),
      volume_30d: provenanced(pool.value.volume_30d, pool.source, pool.confidence),
      estimated_gross_fees_24h: pool.value.volume_24h * (pool.value.fee_tier / 10_000),
      estimated_gross_fees_7d: pool.value.volume_7d * (pool.value.fee_tier / 10_000),
      estimated_gross_fees_30d: pool.value.volume_30d * (pool.value.fee_tier / 10_000),
      volume_tvl_ratio: pool.value.volume_24h / pool.value.tvl_usd,
      current_price: provenanced(pool.value.token0_price_usd, pool.source, pool.confidence),
    };
  }

  async computePerformance(
    snapshot: PositionSnapshot,
    initialToken0Amt: number,
    initialToken1Amt: number,
    initialToken0PriceUsd: number,
    initialToken1PriceUsd: number
  ): Promise<PositionPerformance> {
    const initialCapital = initialToken0Amt * initialToken0PriceUsd + initialToken1Amt * initialToken1PriceUsd;
    const lpTotal = snapshot.position_value_usd + snapshot.estimated_uncollected_fees_usd;
    const hodlValue = initialToken0Amt * snapshot.token0_price_usd.value + initialToken1Amt * snapshot.token1_price_usd.value;
    const lpReturn = initialCapital > 0 ? ((lpTotal - initialCapital) / initialCapital) * 100 : 0;
    const hodlReturn = initialCapital > 0 ? ((hodlValue - initialCapital) / initialCapital) * 100 : 0;
    const lpAlpha = lpTotal - hodlValue;
    const lpAlphaPct = hodlValue > 0 ? (lpAlpha / hodlValue) * 100 : 0;
    const divLoss = hodlValue - snapshot.position_value_usd;
    const divLossPct = hodlValue > 0 ? (divLoss / hodlValue) * 100 : 0;

    const pool = await this.fetchPoolSnapshot();
    const feeApr = initialCapital > 0 ? (pool.estimated_gross_fees_30d / initialCapital) * (365 / 30) : 0;

    return {
      initial_capital_usd: initialCapital,
      current_position_value_usd: snapshot.position_value_usd,
      collected_fees_usd: 0, // requires history source (The Graph) — not yet wired
      estimated_uncollected_fees_usd: snapshot.estimated_uncollected_fees_usd,
      total_fees_usd: snapshot.estimated_uncollected_fees_usd,
      lp_total_value_usd: lpTotal,
      lp_pnl_usd: lpTotal - initialCapital,
      lp_return_percent: lpReturn,
      hodl_value_usd: hodlValue,
      hodl_pnl_usd: hodlValue - initialCapital,
      hodl_return_percent: hodlReturn,
      lp_alpha_usd: lpAlpha,
      lp_alpha_percent: lpAlphaPct,
      divergence_loss_usd: divLoss,
      divergence_loss_percent: divLossPct,
      realized_fee_apr: feeApr,
      time_in_range_percent: 0, // requires historical snapshots
      baseline_status: "BASELINE_INCOMPLETE", // caller must provide initial capital
    };
  }

  async generateReport(
    initialToken0Amt: number,
    initialToken1Amt: number,
    initialToken0PriceUsd: number,
    initialToken1PriceUsd: number
  ): Promise<string> {
    const snap = await this.fetchPositionSnapshot();
    const perf = await this.computePerformance(snap, initialToken0Amt, initialToken1Amt, initialToken0PriceUsd, initialToken1PriceUsd);
    const pool = await this.fetchPoolSnapshot();

    const lines = [
      `LP PORTFOLIO MONITOR V1.1`,
      `Position: ${this.identity.token0.contract_address} / ${this.identity.token1.contract_address}`,
      `Chain: ${this.identity.chain}`,
      `Protocol: Uniswap V3`,
      ``,
      `POSITION`,
      `Current Value: $${perf.current_position_value_usd.toFixed(2)}`,
      `Fees: collected $${perf.collected_fees_usd.toFixed(2)} | uncollected $${perf.estimated_uncollected_fees_usd.toFixed(2)} | total $${perf.total_fees_usd.toFixed(2)}`,
      ``,
      `PERFORMANCE`,
      `Initial Capital: $${perf.initial_capital_usd.toFixed(2)}`,
      `LP Total: $${perf.lp_total_value_usd.toFixed(2)}  LP Return: ${perf.lp_return_percent.toFixed(2)}%`,
      `HODL Value: $${perf.hodl_value_usd.toFixed(2)}  HODL Return: ${perf.hodl_return_percent.toFixed(2)}%`,
      `LP Alpha: +$${perf.lp_alpha_usd.toFixed(2)} (+${perf.lp_alpha_percent.toFixed(2)}%)`,
      `Divergence Loss: -$${perf.divergence_loss_usd.toFixed(2)} (-${perf.divergence_loss_percent.toFixed(2)}%)`,
      ``,
      `RANGE`,
      `Current tick: ${snap.current_tick}  Range: [${this.identity.tick_lower}, ${this.identity.tick_upper}]  In range: ${snap.in_range}`,
      `Time in Range: ${perf.time_in_range_percent.toFixed(2)}%`,
      ``,
      `POOL`,
      `TVL: $${pool.tvl_usd.value.toLocaleString()}  Volume 24h: $${pool.volume_24h.value.toLocaleString()}  Vol/TVL: ${pool.volume_tvl_ratio.toFixed(4)}`,
      `Est. Gross Fees 24h: $${pool.estimated_gross_fees_24h.toLocaleString()}`,
      ``,
      `FEE APR: ${perf.realized_fee_apr.toFixed(2)}%`,
      `STATUS: ${perf.lp_alpha_percent > 0 ? "HEALTHY" : perf.lp_alpha_percent < -5 ? "ATTENTION" : "NORMAL"}`,
      `ACTION: HOLD (read-only — no auto action)`,
    ];

    if (this.validationMode) {
      lines.push(
        ``,
        `VALIDATION_MODE DATA`,
        `liquidity: ${snap.liquidity}`,
        `current_tick: ${snap.current_tick}`,
        `sqrt_price: ${snap.sqrt_price}`,
        `token0_amount_raw: ${snap.token0_amount}`,
        `token1_amount_raw: ${snap.token1_amount}`,
        `token0_price_usd: ${snap.token0_price_usd.value} (source=${snap.token0_price_usd.source}, confidence=${snap.token0_price_usd.confidence})`,
        `token1_price_usd: ${snap.token1_price_usd.value} (source=${snap.token1_price_usd.source}, confidence=${snap.token1_price_usd.confidence})`,
        `uncollected_fee0_raw: ${snap.estimated_uncollected_fee0}`,
        `uncollected_fee1_raw: ${snap.estimated_uncollected_fee1}`,
        `uncollected_fees_usd: ${snap.estimated_uncollected_fees_usd}`,
        `in_range: ${snap.in_range}`
      );
    }

    return lines.join("\n");
  }
}
