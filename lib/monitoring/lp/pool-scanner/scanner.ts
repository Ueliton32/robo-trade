import { PoolScannerStorage } from './storage';
import { RevertPoolDiscoverer } from './revert-discover';
import { normalizePool, deduplicate } from './normalizer';
import { poolScoreV1 } from './scorer';

export class PoolScanner {
  private storage = new PoolScannerStorage();
  private discoverer = new RevertPoolDiscoverer();

  async run(network = 'robinhood', protocol = 'uniswapv3', limit = 100) {
    console.log(`[PoolScanner] Discovering pools ${network}/${protocol}`);
    const discovered = await this.discoverer.discover(network, protocol, limit);
    const normalized = deduplicate(discovered.map(p => normalizePool(p, 'revert')));
    for (const pool of normalized) {
      const poolFk = this.storage.upsertPool({
        network: pool.network,
        protocol: pool.protocol,
        dex: pool.dex,
        pool_address: pool.pool_address,
        token0_address: pool.token0_address,
        token1_address: pool.token1_address,
        token0_symbol: pool.token0_symbol,
        token1_symbol: pool.token1_symbol,
        fee_tier: pool.fee_tier,
        pool_created_at: pool.pool_created_at,
        source: pool.source,
        provenance: pool.provenance,
        timestamp_ms: pool.timestamp_ms
      });
      const score = poolScoreV1(pool);
      this.storage.insertSnapshot(poolFk, {
        ...pool,
        pool_score: score,
        timestamp_ms: pool.timestamp_ms
      });
    }
    const ranking = this.getRanking(network);
    console.log(`[PoolScanner] Discovered ${normalized.length} unique pools`);
    console.log(`[PoolScanner] Top 5:`, ranking.slice(0,5).map((p: any) => ({ address: p.pool_address, score: p.pool_score, tvl: p.tvl })));
    return ranking;
  }

  getRanking(network?: string) {
    const db = (this.storage as any).db;
    const rows = network ? db.prepare(`SELECT p.pool_address, p.network, p.token0_symbol, p.token1_symbol, s.tvl, s.volume_24h, s.pool_score, s.ts FROM pools p JOIN pool_snapshots s ON s.pool_fk = p.id WHERE s.ts = (SELECT MAX(ts) FROM pool_snapshots WHERE pool_fk = p.id) AND p.network = ? ORDER BY s.pool_score DESC`).all(network) :
      db.prepare(`SELECT p.pool_address, p.network, p.token0_symbol, p.token1_symbol, s.tvl, s.volume_24h, s.pool_score, s.ts FROM pools p JOIN pool_snapshots s ON s.pool_fk = p.id WHERE s.ts = (SELECT MAX(ts) FROM pool_snapshots WHERE pool_fk = p.id) ORDER BY s.pool_score DESC`).all();
    return rows;
  }

  compareCurrentPool(network: string, poolAddress: string) {
    const ranking = this.getRanking(network);
    const idx = ranking.findIndex((r: any) => r.pool_address.toLowerCase() === poolAddress.toLowerCase());
    if (idx === -1) return null;
    const total = ranking.length;
    return {
      rank: idx + 1,
      percentile: Math.round((1 - idx / total) * 100),
      total,
      pool: ranking[idx]
    };
  }
}
