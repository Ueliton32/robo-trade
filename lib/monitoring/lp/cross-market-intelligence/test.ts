import { MacroRegime } from './macro';
import { MarketRegime } from './market';
import { CryptoRegime } from './crypto';
import { TokenizationRegime } from './tokenization';
import { LiquidityRegime } from './liquidity';

async function testRegimes() {
  const macro = new MacroRegime();
  const market = new MarketRegime();
  const crypto = new CryptoRegime();
  const tokenization = new TokenizationRegime();
  const liquidity = new LiquidityRegime();

  const [m, ma, c, t, l] = await Promise.all([
    macro.fetch(),
    market.fetch(),
    crypto.fetch(),
    tokenization.fetch(),
    liquidity.fetch()
  ]);

  console.log('Macro:', JSON.stringify(m, null, 2));
  console.log('Market:', JSON.stringify(ma, null, 2));
  console.log('Crypto:', JSON.stringify(c, null, 2));
  console.log('Tokenization:', JSON.stringify(t, null, 2));
  console.log('Liquidity:', JSON.stringify(l, null, 2));

  // Validate no aggregated score
  const obj = { m, ma, c, t, l };
  const hasScore = Object.values(obj).some(regime => 
    'opportunity_score' in regime || 'pool_score' in regime || 'score' in regime
  );
  console.log('No aggregated score present:', !hasScore ? 'PASS' : 'FAIL');
}

testRegimes().catch(console.error);