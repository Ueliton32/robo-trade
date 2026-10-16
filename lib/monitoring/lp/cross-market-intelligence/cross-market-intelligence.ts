import { MacroRegime } from './macro';
import { MarketRegime } from './market';
import { CryptoRegime } from './crypto';
import { TokenizationRegime } from './tokenization';
import { LiquidityRegime } from './liquidity';
import { CrossMarketStorage } from './storage';

export class CrossMarketIntelligence {
  private storage = new CrossMarketStorage();
  private macro = new MacroRegime();
  private market = new MarketRegime();
  private crypto = new CryptoRegime();
  private tokenization = new TokenizationRegime();
  private liquidity = new LiquidityRegime();

  async run(): Promise<void> {
    console.log('[CrossMarketIntelligence] Fetching all regimes...');
    const [macro, market, crypto, tokenization, liquidity] = await Promise.all([
      this.macro.fetch(),
      this.market.fetch(),
      this.crypto.fetch(),
      this.tokenization.fetch(),
      this.liquidity.fetch()
    ]);

    const snapshot = {
      macro,
      market,
      crypto,
      tokenization,
      liquidity,
      ts: Math.floor(Date.now() / 1000)
    };

    this.storage.upsertSnapshot(snapshot);
    console.log('[CrossMarketIntelligence] Snapshot stored');

    // Log summary
    console.log(`Macro: ${macro.state} (conf: ${macro.confidence}%)`);
    console.log(`Market: ${market.state} (conf: ${market.confidence}%)`);
    console.log(`Crypto: ${crypto.state} (conf: ${crypto.confidence}%)`);
    console.log(`Tokenization: ${tokenization.state} (conf: ${tokenization.confidence}%)`);
    console.log(`Liquidity: ${liquidity.state} (conf: ${liquidity.confidence}%)`);
  }

  getLatestSnapshot() {
    return this.storage.getLatestSnapshot();
  }
}
