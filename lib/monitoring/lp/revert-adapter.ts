import type { Provenanced, Provenance } from './adapters';

export type RevertChain = 'robinhood';
export type RevertProtocol = 'uniswapv3';

export type RevertPositionSummary = {
  network: RevertChain;
  protocol: RevertProtocol;
  nft_id: number;
  pool: string;
  token0: string;
  token1: string;
  fee_tier: string;
  pool_tick: number;
  tick_lower: number;
  tick_upper: number;
  in_range: boolean;
  current_amount0: string;
  current_amount1: string;
  underlying_value: string;
  fees_value: string;
  uncollected_fees0: string;
  uncollected_fees1: string;
  age_days: number;
  price_provenance: { source: string; observed_at: number; freshness_semantics: string };
  tokens: Record<string, { address: string; symbol: string; decimals: number; price: string }>;
};

export type RevertPositionDetails = {
  network: RevertChain;
  protocol: RevertProtocol;
  nft_id: number;
  pool: string;
  token0: string;
  token1: string;
  fee_tier: string;
  tick_lower: number;
  tick_upper: number;
  pool_tick: number;
  in_range: boolean;
  current_amount0: string;
  current_amount1: string;
  liquidity: string;
  sqrt_price: string;
  pool_price: string;
  underlying_value: string;
  deposits_value: string;
  total_deposits0: string;
  total_deposits1: string;
  diffs0: string;
  diffs1: string;
  first_mint_ts: number;
  age_days: number;
  price_provenance: { source: string; observed_at: number; freshness_semantics: string };
  uncollected_fees0: string;
  uncollected_fees1: string;
  total_fees0: string;
  total_fees1: string;
  collected_fees0: string;
  collected_fees1: string;
  cash_flows: Array<any>;
  tokens: Record<string, { address: string; symbol: string; decimals: number; price: string }>;
};

export type RevertPoolState = {
  network: RevertChain;
  protocol: RevertProtocol;
  pool_address: string;
  chain_id: number;
  current_tick: number;
  current_price: string;
  tick_spacing: number;
  fresh_state: { block_number: string; block_hash: string; block_timestamp: string };
  price_orientation: { base_token: { address: string; symbol: string; decimals: number }; quote_token: { address: string; symbol: string; decimals: number }; meaning: string };
  tokens: Array<{ address: string; symbol: string; decimals: number }>;
};

export type RevertChainStatus = {
  network: string;
  exchange: string;
  chain_tip: number;
  subgraph_last_snapshot: number;
  db_last_snapshot: number;
  subgraph_delay: number;
  db_delay: number;
  total_delay: number;
  subgraph_ts: number;
  db_ts: number;
  chain_ts: number;
};

export type RevertPositionV12 = {
  source: 'DIRECT_INDEXER';
  network: RevertChain;
  protocol: RevertProtocol;
  position_id: number;
  pool_address: Provenanced<string>;
  token0: Provenanced<{ address: string; symbol: string; decimals: number }>;
  token1: Provenanced<{ address: string; symbol: string; decimals: number }>;
  fee_tier: Provenanced<number>;
  tick_lower: Provenanced<number>;
  tick_upper: Provenanced<number>;
  liquidity: Provenanced<string>;
  current_amounts: { token0: Provenanced<string>; token1: Provenanced<string> };
  uncollected_fees: { token0: Provenanced<string>; token1: Provenanced<string> };
  collected_fees: { token0: Provenanced<string>; token1: Provenanced<string> };
  total_fees: { token0: Provenanced<string>; token1: Provenanced<string> };
  current_price: Provenanced<string>;
  in_range: Provenanced<boolean>;
  baseline: { first_mint_ts: number; total_deposits0: string; total_deposits1: string; deposits_value_usd: string; cash_flows: Array<any> };
  freshness: { observed_at: number; block_number?: string; total_delay_sec?: number };
};

function parseBigInt(s: string) { return s === '' ? BigInt(0) : BigInt(s); }

export class TransportError extends Error { constructor(msg:string, public status?:number, public body?:string){ super(msg); this.name='TransportError'; } }
export class ProtocolError extends Error { constructor(msg:string){ super(msg); this.name='ProtocolError'; } }
export class ParseError extends Error { constructor(msg:string, public raw?:string){ super(msg); this.name='ParseError'; } }
export class JsonRpcError extends Error { constructor(msg:string, public code?:number){ super(msg); this.name='JsonRpcError'; } }
export class ToolExecutionError extends Error { constructor(msg:string){ super(msg); this.name='ToolExecutionError'; } }
export class UnexpectedResponseError extends Error { constructor(msg:string, public details?:any){ super(msg); this.name='UnexpectedResponseError'; } }

export class RevertReadOnlyClient {
  private endpoint: string = 'https://mcp.revert.finance/mcp';
  private sessionId?: string;
  private toolSchemas: Record<string, any> = {};

  private translateProtocolToExchange(protocol: string): string {
    const map: Record<string, string> = {
      'uniswapv3': 'uniswapv3',
      'uniswapv4': 'uniswapv4',
      'stableswap': 'stableswap',
      'aerodrome': 'aerodrome',
      'pancakeswapv3': 'pancakeswapv3',
    };
    const exchange = map[protocol];
    if (!exchange) {
      throw new ToolExecutionError(`No exchange mapping for protocol: ${protocol}`);
    }
    return exchange;
  }

  private filterArguments(method: string, args: Record<string, any>): Record<string, any> {
    const schema = this.toolSchemas[method];
    if (!schema) return args;
    const allowed = new Set(Object.keys(schema.properties || {}));
    const filtered: Record<string, any> = {};
    for (const [k, v] of Object.entries(args)) {
      if (allowed.has(k)) {
        filtered[k] = v;
      } else if (k === 'protocol' && allowed.has('exchange')) {
        filtered['exchange'] = this.translateProtocolToExchange(String(v));
      } else {
        // silently drop unknown fields
      }
    }
    return filtered;
  }

  async initialize(): Promise<void> {
      const body = JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'lp-monitor', version: '1' } }
      });
      const req = new Request(this.endpoint, { method: 'POST', body, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' } });
      const res = await fetch(req);
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        throw new TransportError(`Initialize failed ${res.status}`, res.status, txt);
      }
      const session = res.headers.get('mcp-session-id');
      if (!session) throw new ProtocolError('No session id in initialize response');
      this.sessionId = session;
      // Fetch tool schemas for argument validation
      await this.fetchToolSchemas();
    }

    private async fetchToolSchemas(): Promise<void> {
      if (!this.sessionId) return;
      const body = JSON.stringify({ jsonrpc: '2.0', id: Math.floor(Math.random()*1e9), method: 'tools/list', params: {} });
      try {
        const res = await fetch(this.endpoint, {
          method: 'POST', body,
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': this.sessionId!, 'MCP-Protocol-Version': '2025-06-18' }
        });
        const text = await res.text().catch(()=> '');
        const lines = text.split('\n');
        let jsonStr = '';
        for (const line of lines) { if (line.startsWith('data: ')) jsonStr += line.substring(6); }
        if (!jsonStr) return;
        const parsed = JSON.parse(jsonStr.trim());
        const tools = parsed?.result?.tools;
        if (Array.isArray(tools)) {
          for (const t of tools) { this.toolSchemas[t.name] = t.inputSchema; }
        }
      } catch {
        // non-fatal: continue without schemas
      }
    }

  private async call(method: string, params: any) {
    if (!this.sessionId) await this.initialize();
    const filtered = this.filterArguments(method, params);
    const body = JSON.stringify({
      jsonrpc: '2.0', id: Math.floor(Math.random()*1e9), method: 'tools/call',
      params: { name: method, arguments: filtered }
    });
    const start = Date.now();
    const res = await fetch(this.endpoint, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'mcp-session-id': this.sessionId!, 'MCP-Protocol-Version': '2025-06-18' }
    });
    const status = res.status;
    const contentType = res.headers.get('content-type') || '';
    const rawText = await res.text().catch(()=> '');
    console.log(`[Revert] ${method} status=${status} content-type=${contentType} duration=${Date.now()-start}ms`);
    if (!res.ok) {
      throw new TransportError(`HTTP ${status} for ${method}`, status, rawText.slice(0,500));
    }
    // Validate content type
    if (!contentType.includes('text/event-stream') && !contentType.includes('application/json')) {
      throw new UnexpectedResponseError(`Unexpected content-type ${contentType}`, { method, status, contentType, sample: rawText.slice(0,200) });
    }
    // Extract data lines from SSE
    const lines = rawText.split('\n');
    let jsonStr = '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        jsonStr += line.substring(6);
      }
    }
    if (!jsonStr) {
      throw new ParseError('No data field in SSE response', rawText.slice(0,500));
    }
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr.trim());
    } catch (e: any) {
      throw new ParseError(`Failed to parse JSON for ${method}: ${e.message}`, jsonStr.slice(0,500));
    }
    if (parsed.error) {
      throw new JsonRpcError(`JSON-RPC error for ${method}: ${parsed.error.message}`, parsed.error.code);
    }
    const result = parsed.result;
    if (!result || !result.content || !result.content[0] || typeof result.content[0].text !== 'string') {
      throw new UnexpectedResponseError(`Unexpected MCP result shape for ${method}`, { result });
    }
    let payload: any;
    try {
      payload = JSON.parse(result.content[0].text);
    } catch (e: any) {
      throw new ParseError(`Failed to parse tool payload for ${method}: ${e.message}`, result.content[0].text.slice(0,500));
    }
    if (typeof payload === 'object' && payload !== null && 'success' in payload) {
      if (payload.success !== true) {
        throw new ToolExecutionError(`Tool ${method} failed: ${payload.error ?? 'unknown'}`);
      }
      return payload.data;
    }
    return payload;
  }

  async getPositions(account: string): Promise<RevertPositionSummary[]> {
    return this.call('get_positions', { account, limit: 100 }) as Promise<RevertPositionSummary[]>;
  }

  async getPositionDetails(network: RevertChain, protocol: RevertProtocol, position_id: number): Promise<RevertPositionDetails> {
    return this.call('get_position_details', { network, protocol, position_id: position_id.toString() }) as Promise<RevertPositionDetails>;
  }

  async getPoolState(network: RevertChain, protocol: RevertProtocol, pool_address: string): Promise<RevertPoolState> {
    return this.call('get_pool_state', { network, protocol, pool_address }) as Promise<RevertPoolState>;
  }

  async getChainStatus(): Promise<RevertChainStatus[]> {
    return this.call('get_chain_status', {}) as Promise<RevertChainStatus[]>;
  }

  async discoverPools(params: { network?: string; protocol?: string; limit?: number }): Promise<any> {
    return this.call('discover_pools', params);
  }
}

export function buildRevertPositionV12(details: RevertPositionDetails, poolState: RevertPoolState): RevertPositionV12 {
  const prov = (v: any, source: Provenance, ts: number) => ({ value: v, source, timestamp_ms: ts, confidence: 0.9 });
  return {
    source: 'DIRECT_INDEXER',
    network: details.network,
    protocol: details.protocol,
    position_id: details.nft_id,
    pool_address: prov(details.pool, 'DIRECT_INDEXER', details.price_provenance.observed_at),
    token0: prov({ address: details.token0, symbol: details.tokens[details.token0]?.symbol ?? 'T0', decimals: details.tokens[details.token0]?.decimals ?? 18 }, 'DIRECT_INDEXER', details.price_provenance.observed_at),
    token1: prov({ address: details.token1, symbol: details.tokens[details.token1]?.symbol ?? 'T1', decimals: details.tokens[details.token1]?.decimals ?? 18 }, 'DIRECT_INDEXER', details.price_provenance.observed_at),
    fee_tier: prov(Number(details.fee_tier), 'DIRECT_INDEXER', details.price_provenance.observed_at),
    tick_lower: prov(details.tick_lower, 'DIRECT_INDEXER', details.price_provenance.observed_at),
    tick_upper: prov(details.tick_upper, 'DIRECT_INDEXER', details.price_provenance.observed_at),
    liquidity: prov(details.liquidity, 'DIRECT_INDEXER', details.price_provenance.observed_at),
    current_amounts: {
      token0: prov(details.current_amount0, 'DIRECT_INDEXER', details.price_provenance.observed_at),
      token1: prov(details.current_amount1, 'DIRECT_INDEXER', details.price_provenance.observed_at),
    },
    uncollected_fees: {
      token0: prov(details.uncollected_fees0, 'DIRECT_INDEXER', details.price_provenance.observed_at),
      token1: prov(details.uncollected_fees1, 'DIRECT_INDEXER', details.price_provenance.observed_at),
    },
    collected_fees: {
      token0: prov(details.collected_fees0 ?? '0', 'DIRECT_INDEXER', details.price_provenance.observed_at),
      token1: prov(details.collected_fees1 ?? '0', 'DIRECT_INDEXER', details.price_provenance.observed_at),
    },
    total_fees: {
      token0: prov(details.total_fees0, 'DIRECT_INDEXER', details.price_provenance.observed_at),
      token1: prov(details.total_fees1, 'DIRECT_INDEXER', details.price_provenance.observed_at),
    },
    current_price: prov(details.pool_price, 'DIRECT_INDEXER', details.price_provenance.observed_at),
    in_range: prov(details.in_range, 'DIRECT_INDEXER', details.price_provenance.observed_at),
    baseline: {
      first_mint_ts: details.first_mint_ts,
      total_deposits0: details.total_deposits0,
      total_deposits1: details.total_deposits1,
      deposits_value_usd: details.deposits_value,
      cash_flows: details.cash_flows ?? []
    },
    freshness: {
      observed_at: details.price_provenance.observed_at,
      block_number: poolState.fresh_state?.block_number
    }
  };
}
