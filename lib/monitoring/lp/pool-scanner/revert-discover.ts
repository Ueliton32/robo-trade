import { RevertReadOnlyClient } from '../revert-adapter';

export type DiscoveredPool = {
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
  apr?: number;
  source: string;
};

export class RevertPoolDiscoverer {
  private client: RevertReadOnlyClient;
  constructor() {
    this.client = new RevertReadOnlyClient();
  }
  async discover(network: string, protocol: string, limit = 100): Promise<DiscoveredPool[]> {
    const raw = await this.client.discoverPools({ network, protocol, limit });
    if (!raw || !Array.isArray(raw)) return [];
    return raw.map((p: any) => ({
      network: p.network ?? network,
      protocol: p.protocol ?? protocol,
      dex: p.dex ?? p.exchange ?? 'uniswapv3',
      pool_address: p.pool_address ?? p.address ?? p.pool,
      token0_address: p.token0,
      token1_address: p.token1,
      token0_symbol: p.token0_symbol,
      token1_symbol: p.token1_symbol,
      fee_tier: p.fee_tier ? Number(p.fee_tier) : undefined,
      tvl: p.tvl_usd ? Number(p.tvl_usd) : undefined,
      volume_24h: p.volume_usd ? Number(p.volume_usd) : undefined,
      apr: p.apr ? Number(p.apr) : undefined,
      source: 'revert'
    }));
  }
}
