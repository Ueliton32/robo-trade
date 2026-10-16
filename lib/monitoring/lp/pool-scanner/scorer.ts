import { NormalizedPool } from './normalizer';

export function poolScoreV1(pool: NormalizedPool): number {
  const components: number[] = [];

  // TVL score 0-100, log scaled
  if (pool.tvl && pool.tvl > 0) {
    const tvlScore = Math.min(100, Math.log10(pool.tvl + 1) * 10);
    components.push(tvlScore);
  } else {
    components.push(0);
  }

  // Volume 24h score
  if (pool.volume_24h && pool.volume_24h > 0) {
    const volScore = Math.min(100, Math.log10(pool.volume_24h + 1) * 8);
    components.push(volScore);
  } else {
    components.push(0);
  }

  // Volume / TVL turnover
  if (pool.tvl && pool.tvl > 0 && pool.volume_24h && pool.volume_24h > 0) {
    const turnover = pool.volume_24h / pool.tvl;
    const turnoverScore = Math.min(100, turnover * 1000);
    components.push(turnoverScore);
  } else {
    components.push(0);
  }

  // Age score: pools older than 7 days get higher score
  if (pool.pool_created_at) {
    const ageDays = (Date.now() - pool.pool_created_at * 1000) / (1000 * 60 * 60 * 24);
    const ageScore = Math.min(100, Math.max(0, ageDays / 365 * 100));
    components.push(ageScore);
  } else {
    components.push(50);
  }

  // Freshness / consistency placeholder
  components.push(70);

  const avg = components.reduce((a, b) => a + b, 0) / components.length;
  return Math.max(0, Math.min(100, Math.round(avg)));
}
