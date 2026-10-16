import { normalizePool, deduplicate } from './normalizer';
import { poolScoreV1 } from './scorer';

function testNormalization() {
  const raw = { network: 'robinhood', protocol: 'uniswapv3', pool: '0xabc', token0: '0x1', token1: '0x2', tvl: '1000' };
  const n = normalizePool(raw, 'revert');
  console.assert(n.pool_address === '0xabc', 'normalize');
  const dup = deduplicate([n, n]);
  console.assert(dup.length === 1, 'dedup');
  const score = poolScoreV1(n);
  console.assert(score >= 0 && score <= 100, 'score range');
  console.log('Tests passed');
}

testNormalization();
