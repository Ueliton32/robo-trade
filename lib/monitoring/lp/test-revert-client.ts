import { RevertReadOnlyClient } from './revert-adapter';

async function main() {
  const client = new RevertReadOnlyClient();
  try {
    const data = await client.discoverPools({ network: 'robinhood', protocol: 'uniswapv3', limit: 10 });
    console.log('discover_pools result:', JSON.stringify(data).slice(0, 2000));
    console.log('REVERT CLIENT VALIDATED');
  } catch (e: any) {
    console.error('discover_pools failed:', e.name, e.message);
    process.exit(1);
  }
}

main();
