import { fetchJson } from './data-fetcher';

async function test() {
  const data = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
  console.log(data);
}

test().catch(console.error);