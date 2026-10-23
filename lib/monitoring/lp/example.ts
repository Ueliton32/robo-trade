// LP Portfolio Monitor V1.1 — minimal example with mocks
// Demonstrates the monitor contract without real adapters.

import { LpPortfolioMonitor, PositionIdentity, CoinGeckoAdapter, RealGeckoTerminalAdapter, RealRpcAdapter, Provenanced } from "./adapters.js";

// Mock CoinGecko adapter for standalone demo
class MockCoinGeckoAdapter implements CoinGeckoAdapter {
  async getTokenPriceUsd(ref: any): Promise<Provenanced<number>> {
    return { value: ref.symbol === "WETH" ? 3000 : 1, source: "MOCK", timestamp_ms: Date.now(), confidence: 0.5 };
  }
  async getTokenMarketChartRange(ref: any, from: number, to: number): Promise<Provenanced<Array<[number, number]>>> {
    return { value: [], source: "MOCK", timestamp_ms: Date.now(), confidence: 0 };
  }
}

const IDENTITY: PositionIdentity = {
  wallet_address: "0x00000000000000000000000000000000000000",
  chain: "base",
  position_id: "0",
  pool_address: "0x2df380544b88adb3ad0a94100dcc45fd705aae2d",
  token0: { chain: "base", contract_address: "0x420000000000000000000000000000000006", symbol: "WETH" },
  token1: { chain: "base", contract_address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC" },
  fee_tier: 500,
  tick_lower: 190000,
  tick_upper: 200000,
};

async function main() {
  const cg = new MockCoinGeckoAdapter();
  const gt = new RealGeckoTerminalAdapter();
  // Use a mock RPC adapter for standalone demo (no RPC URL needed)
  const rpc = new RealRpcAdapter("", "");
  const monitor = new LpPortfolioMonitor(IDENTITY, cg, gt, rpc, true);
  const report = await monitor.generateReport(0.01, 30, 3000, 1);
  console.log(report);
}

main().catch(console.error);
