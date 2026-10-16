// LP Portfolio Monitor V1.1 — validation scaffolding
// Validates a real Uniswap V3 position read-only with all adapters wired.
// No transactions, no signatures, no wallet movement.

import { LpPortfolioMonitor, PositionIdentity, AisaCoinGeckoAdapter, RealGeckoTerminalAdapter, RealRpcAdapter } from "./adapters.js";

// ========== CONFIGURATION ==========
// Set via env — NEVER commit secrets.
const RPC_URLS: Record<string, string> = {
  ethereum: process.env.RPC_URL_ETHEREUM || "",
  base: process.env.RPC_URL_BASE || "",
  arbitrum: process.env.RPC_URL_ARBITRUM || "",
};
const POSITION_MANAGER_ADDRESSES: Record<string, string> = {
  ethereum: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  base: "0x0384d1f5c338382789f588718635e406664c879e",
  arbitrum: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
};

// ========== VALIDATION SCENARIO ==========
// Known public Uniswap V3 pool for testing (non-funded wallet):
// ETH/USDC 0.05% on Base — pool 0x2df380544b88adb3ad0a94100dcc45fd705aae2d
// Chain: base
// No wallet/position required — pool-level validation only.
// For position-level validation, supply the three values below.

const VALIDATION_POSITION: PositionIdentity = {
  wallet_address: "", // ← required for position-level validation
  chain: "base",
  position_id: "", // ← required NFT tokenId
  pool_address: "0x2df380544b88adb3ad0a94100dcc45fd705aae2d",
  token0: {
    chain: "base",
    contract_address: "0x42000000000000000000000000000000000006", // WETH on Base
    symbol: "WETH",
  },
  token1: {
    chain: "base",
    contract_address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
    symbol: "USDC",
  },
  fee_tier: 500,
  tick_lower: 190000,
  tick_upper: 200000,
};

async function main() {
  console.log("LP Portfolio Monitor V1.1 — Validation");
  console.log("======================================");

  // Validate env
  const rpcUrl = RPC_URLS[VALIDATION_POSITION.chain];
  if (!rpcUrl) {
    console.error(`Missing RPC_URL_${VALIDATION_POSITION.chain.toUpperCase()}`);
    process.exit(1);
  }
  const pmAddr = POSITION_MANAGER_ADDRESSES[VALIDATION_POSITION.chain];
  if (!pmAddr) {
    console.error(`Missing Position Manager for ${VALIDATION_POSITION.chain}`);
    process.exit(1);
  }

  // Wire adapters
  const cg = new AisaCoinGeckoAdapter("validation-session", 1);
  const gt = new RealGeckoTerminalAdapter(10_000);
  const rpc = new RealRpcAdapter(rpcUrl, pmAddr);
  const monitor = new LpPortfolioMonitor(VALIDATION_POSITION, cg, gt, rpc, true);

  // 1. GeckoTerminal pool info
  console.log("\n1. GeckoTerminal pool info...");
  try {
    const pool = await gt.getPoolInfo(VALIDATION_POSITION.chain, VALIDATION_POSITION.pool_address);
    console.log(`   TVL: $${pool.value.tvl_usd.toLocaleString()}`);
    console.log(`   Volume 24h: $${pool.value.volume_24h.toLocaleString()}`);
    console.log(`   Fee tier: ${pool.value.fee_tier}`);
    console.log(`   Confidence: ${pool.confidence}`);
    console.log(`   Source: ${pool.source}`);
  } catch (e) {
    console.error(`   FAILED: ${(e as Error).message}`);
  }

  // 2. GeckoTerminal OHLCV
  console.log("\n2. GeckoTerminal OHLCV (1h)...");
  try {
    const ohlcv = await gt.getPoolOhlcv(VALIDATION_POSITION.chain, VALIDATION_POSITION.pool_address, "hourly");
    console.log(`   Points returned: ${ohlcv.value.length}`);
    if (ohlcv.value.length > 0) {
      console.log(`   Last candle: time=${ohlcv.value[ohlcv.value.length - 1][0]} o=${ohlcv.value[ohlcv.value.length - 1][1]} h=${ohlcv.value[ohlcv.value.length - 1][2]} l=${ohlcv.value[ohlcv.value.length - 1][3]} c=${ohlcv.value[ohlcv.value.length - 1][4]} v=${ohlcv.value[ohlcv.value.length - 1][5]}`);
    }
  } catch (e) {
    console.error(`   FAILED: ${(e as Error).message}`);
  }

  // 3. CoinGecko price
  console.log("\n3. CoinGecko price lookup...");
  try {
    const p0 = await cg.getTokenPriceUsd(VALIDATION_POSITION.token0);
    const p1 = await cg.getTokenPriceUsd(VALIDATION_POSITION.token1);
    console.log(`   Token0 price: ${p0.value} USD (source=${p0.source}, confidence=${p0.confidence})`);
    console.log(`   Token1 price: ${p1.value} USD (source=${p1.source}, confidence=${p1.confidence})`);
  } catch (e) {
    console.error(`   FAILED: ${(e as Error).message}`);
  }

  // 4. Position snapshot (requires position_id + wallet_address)
  if (VALIDATION_POSITION.position_id && VALIDATION_POSITION.wallet_address) {
    console.log("\n4. Position snapshot...");
    try {
      const snap = await monitor.fetchPositionSnapshot();
      console.log(`   Current tick: ${snap.current_tick}`);
      console.log(`   In range: ${snap.in_range}`);
      console.log(`   Position value: $${snap.position_value_usd.toFixed(2)}`);
      console.log(`   Uncollected fees USD: $${snap.estimated_uncollected_fees_usd.toFixed(2)}`);
      console.log(`   Token0 amount: ${snap.token0_amount}`);
      console.log(`   Token1 amount: ${snap.token1_amount}`);
    } catch (e) {
      console.error(`   FAILED: ${(e as Error).message}`);
    }
  } else {
    console.log("\n4. Position snapshot: SKIPPED (no position_id/wallet_address)");
  }

  // 5. Full report
  console.log("\n5. Full report:");
  try {
    const report = await monitor.generateReport(0.01, 30, 3000, 1);
    console.log(report);
  } catch (e) {
    console.error(`   FAILED: ${(e as Error).message}`);
  }

  console.log("\nValidation complete.");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
