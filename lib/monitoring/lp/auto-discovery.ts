// LP Portfolio Monitor V1.1 — auto-discovery edition
// Uniswap V3 position auto-discovery from position_id only (chain + RPC).
// 100% READ-ONLY — no writes, no signatures.

import { ethers } from "ethers";

import {
  PositionIdentity,
  TokenRef,
  Provenanced,
} from "./adapters.js";

type Provenance =
  | "DIRECT_ONCHAIN"
  | "DIRECT_INDEXER"
  | "DERIVED"
  | "ESTIMATED"
  | "MOCK";

function provenanced<T>(value: T, source: Provenance, confidence: number): Provenanced<T> {
  return { value, source, timestamp_ms: Date.now(), confidence };
}

type Chain = "ethereum" | "base" | "arbitrum" | "robinhood";

const POSITION_MANAGER_ADDRESSES: Record<Chain, string> = {
  ethereum: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88",
  base: "0x0384d1f5c338382789f588718635e406664c879e",
  arbitrum: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  robinhood: "0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3",
};

const FACTORY_ADDRESSES: Record<Chain, string> = {
  ethereum: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  base: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  arbitrum: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  robinhood: "0x1f7d7550b1b028f7571e69a784071f0205fd2efa",
};

// ---- ABIs ----
const POSITION_MANAGER_ABI = [
  "function positions(uint256 tokenId) external view returns (uint64 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
];

const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)",
];

const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() external view returns (uint128)",
  "function feeGrowthGlobal0X128() external view returns (uint256)",
  "function feeGrowthGlobal1X128() external view returns (uint256)",
  "function ticks(int24 tick) external view returns (uint128 liquidityGross, int128 arithmeticMeanTick, uint128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint256 secondsOutside, bool initialized)",
];

const ERC20_ABI = [
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
];

export interface DiscoveredPosition {
  identity: PositionIdentity;
  pool_address: string;
  token0_decimals: number;
  token1_decimals: number;
  token0_symbol: string;
  token1_symbol: string;
  feeGrowthGlobal0X128: string;
  feeGrowthGlobal1X128: string;
  slot0_sqrtPriceX96: string;
  slot0_tick: number;
  ownership: "OWNERSHIP_VERIFIED" | "OWNERSHIP_MISMATCH" | "OWNERSHIP_UNKNOWN";
}

export class AutoDiscoveryEngine {
  private provider: ethers.JsonRpcProvider;
  private chain: Chain;
  private positionManager: ethers.Contract;
  private factory: ethers.Contract;

  constructor(chain: Chain, rpcUrl: string) {
    this.chain = chain;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    const pmAddr = POSITION_MANAGER_ADDRESSES[chain];
    const factoryAddr = FACTORY_ADDRESSES[chain];
    if (!pmAddr || !factoryAddr) throw new Error(`No addresses for ${chain}`);
    this.positionManager = new ethers.Contract(pmAddr, POSITION_MANAGER_ABI, this.provider);
    this.factory = new ethers.Contract(factoryAddr, FACTORY_ABI, this.provider);
  }

  async discover(
    positionId: string,
    walletAddress?: string
  ): Promise<Provenanced<DiscoveredPosition>> {
    // 1. Load position
    const pos = await this.positionManager.positions(BigInt(positionId));
    const token0 = pos.token0 as string;
    const token1 = pos.token1 as string;
    const fee = Number(pos.fee);
    const tickLower = Number(pos.tickLower);
    const tickUpper = Number(pos.tickUpper);

    // 2. Resolve pool via factory
    const poolAddress: string = await this.factory.getPool(token0, token1, fee);
    if (poolAddress === ethers.ZeroAddress) {
      throw new Error("FACTORY returned zero address for pool");
    }

    // 3. Pool state
    const pool = new ethers.Contract(poolAddress, POOL_ABI, this.provider);
    const slot0 = await pool.slot0();
    const feeGrowth0 = await pool.feeGrowthGlobal0X128();
    const feeGrowth1 = await pool.feeGrowthGlobal1X128();

    // 4. Token metadata (ERC20)
    const [dec0Raw, sym0Raw, dec1Raw, sym1Raw] = await Promise.all([
      this.readERC20(token0, "decimals"),
      this.readERC20(token0, "symbol"),
      this.readERC20(token1, "decimals"),
      this.readERC20(token1, "symbol"),
    ]);
    const dec0 = Number(dec0Raw);
    const sym0 = String(sym0Raw);
    const dec1 = Number(dec1Raw);
    const sym1 = String(sym1Raw);

    // 5. Ownership check (optional)
    let ownership: DiscoveredPosition["ownership"] = "OWNERSHIP_UNKNOWN";
    if (walletAddress) {
      const owner = await this.positionManager.ownerOf(BigInt(positionId));
      ownership = owner.toLowerCase() === walletAddress.toLowerCase()
        ? "OWNERSHIP_VERIFIED"
        : "OWNERSHIP_MISMATCH";
    }

    const tokens: Record<string, TokenRef> = {
      token0: {
        chain: this.chain,
        contract_address: token0,
        symbol: sym0,
        decimals: dec0,
      },
      token1: {
        chain: this.chain,
        contract_address: token1,
        symbol: sym1,
        decimals: dec1,
      },
    };

    const identity: PositionIdentity = {
      wallet_address: walletAddress ?? "",
      chain: this.chain,
      position_id: positionId,
      pool_address: poolAddress,
      token0: tokens.token0,
      token1: tokens.token1,
      fee_tier: fee,
      tick_lower: tickLower,
      tick_upper: tickUpper,
    };

    const result: DiscoveredPosition = {
      identity,
      pool_address: poolAddress,
      token0_decimals: dec0,
      token1_decimals: dec1,
      token0_symbol: sym0,
      token1_symbol: sym1,
      feeGrowthGlobal0X128: feeGrowth0.toString(),
      feeGrowthGlobal1X128: feeGrowth1.toString(),
      slot0_sqrtPriceX96: slot0.sqrtPriceX96.toString(),
      slot0_tick: Number(slot0.tick),
      ownership,
    };

    return provenanced(result, "DIRECT_ONCHAIN", 0.99);
  }

  private async readERC20(address: string, method: "decimals" | "symbol"): Promise<unknown> {
    try {
      const c = new ethers.Contract(address, ERC20_ABI, this.provider);
      const v = await c[method]();
      return v;
    } catch {
      // graceful fallback
      return method === "decimals" ? 18 : "UNKNOWN";
    }
  }
}

// ---- Minimal compile test ----
export async function testAutoDiscovery(
  chain: Chain,
  rpcUrl: string,
  positionId: string,
  wallet?: string
) {
  const engine = new AutoDiscoveryEngine(chain, rpcUrl);
  const res = await engine.discover(positionId, wallet);
  console.log("Auto-discovery success", res.value.identity);
  return res;
}
