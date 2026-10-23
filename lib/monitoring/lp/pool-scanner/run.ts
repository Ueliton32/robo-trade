import { PoolScanner } from './scanner';

async function main() {
  const scanner = new PoolScanner();
  const ranking = await scanner.run('robinhood', 'uniswapv3', 50);
  console.log('Ranking count:', ranking.length);
  const comp = scanner.compareCurrentPool('robinhood', '0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3');
  if (comp) {
    console.log('Current pool comparison:');
    console.log(`Rank ${comp.rank}/${comp.total} - Percentile ${comp.percentile}`);
    console.log(comp.pool);
  } else {
    console.log('Current pool not found in ranking');
    console.log('All ranking:', JSON.stringify(ranking.slice(0,5), null, 2));
  }
}

main().catch(console.error);
