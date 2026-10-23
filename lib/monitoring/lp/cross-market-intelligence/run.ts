import { CrossMarketIntelligence } from './cross-market-intelligence';

async function main() {
  const intelligence = new CrossMarketIntelligence();
  await intelligence.run();
  const latest = intelligence.getLatestSnapshot();
  if (latest) {
    console.log('\nLatest snapshot:');
    console.log(JSON.stringify(latest, null, 2));
  }
}

main().catch(console.error);