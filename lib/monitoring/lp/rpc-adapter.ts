import { ethers } from 'ethers';
import type { Provenanced, Provenance } from './adapters';

export type Chain = 'ethereum' | 'base' | 'arbitrum' | 'robinhood';

export type PositionIdentity = {
  chain: Chain;
  position_id: number;
  wallet_address?: string;
};

export type OnChainPosition = {
  source: 'DIRECT_ONCHAIN';
  network: Chain;
  position_id: number;
  pool_address: Provenanced<string>;
  token0: Provenanced<{address:string;symbol:string;decimals:number}>;
  token1: Provenanced<{address:string;symbol:string;decimals:number}>;
  fee_tier: Provenanced<number>;
  tick_lower: Provenanced<number>;
  tick_upper: Provenanced<number>;
  liquidity: Provenanced<string>;
  pool_tick: Provenanced<number>;
  current_amounts: { token0: Provenanced<string>; token1: Provenanced<string> };
  uncollected_fees: { token0: Provenanced<string>; token1: Provenanced<string> };
  block_number: number;
  timestamp_ms: number;
};

const ERC20_ABI = ['function decimals() view returns (uint8)','function symbol() view returns (string)'];
const POOL_ABI = [
  'function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,int32 unlocked)',
  'function liquidity() view returns (uint128)',
  'function feeGrowthGlobal0X128() view returns (uint256)',
  'function feeGrowthGlobal1X128() view returns (uint256)',
  'function tokens() view returns (address,address)',
  'function tickSpacing() view returns (int24)'
];
const NFPOS_ABI = [
  'function positions(uint256 tokenId) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)',
  'function ownerOf(uint256 tokenId) view returns (address)'
];

export class RpcV3Adapter {
  private provider: ethers.JsonRpcProvider;
  private chain: Chain;
  constructor(rpcUrl: string, chain: Chain) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.chain = chain;
  }

  async autoDiscover(identity: PositionIdentity): Promise<OnChainPosition> {
    const managerAddr = await this.managerAddress();
    const factoryAddr = await this.factoryAddress();
    const nfp = new ethers.Contract(managerAddr, NFPOS_ABI, this.provider);
    const pos = await nfp.positions(identity.position_id);
    const token0 = pos.token0;
    const token1 = pos.token1;
    const fee = Number(pos.fee);
    const tickLower = Number(pos.tickLower);
    const tickUpper = Number(pos.tickUpper);
    const liquidity = pos.liquidity.toString();
    const factory = new ethers.Contract(factoryAddr, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
    const poolAddr = await factory.getPool(token0, token1, fee);
    if(poolAddr === ethers.ZeroAddress) throw new Error('Pool zero');
    const pool = new ethers.Contract(poolAddr, POOL_ABI, this.provider);
    const slot0 = await pool.slot0();
    const poolTick = Number(slot0.tick);
    const poolLiq = (await pool.liquidity()).toString();
    const block = await this.provider.getBlock('latest');
    const ts = Number(block?.timestamp ?? 0);
    const bn = Number(block?.number ?? 0);
    const t0 = new ethers.Contract(token0, ERC20_ABI, this.provider);
    const t1 = new ethers.Contract(token1, ERC20_ABI, this.provider);
    const [dec0, sym0] = await Promise.all([t0.decimals(), t0.symbol()]);
    const [dec1, sym1] = await Promise.all([t1.decimals(), t1.symbol()]);
    const prov = (v:any) => ({value:v, source:'DIRECT_ONCHAIN' as Provenance, timestamp_ms: ts, confidence:1});
    return {
      source:'DIRECT_ONCHAIN',
      network:this.chain,
      position_id:identity.position_id,
      pool_address: prov(poolAddr),
      token0: prov({address:token0, symbol:sym0, decimals:Number(dec0)}),
      token1: prov({address:token1, symbol:sym1, decimals:Number(dec1)}),
      fee_tier: prov(fee),
      tick_lower: prov(tickLower),
      tick_upper: prov(tickUpper),
      liquidity: prov(liquidity),
      pool_tick: prov(poolTick),
      current_amounts: { token0: prov('0'), token1: prov('0') },
      uncollected_fees: { token0: prov('0'), token1: prov('0') },
      block_number: bn,
      timestamp_ms: ts
    };
  }

  private async managerAddress(): Promise<string> {
    const map: Record<Chain,string> = {
      ethereum:'0xC36442b4a4522E871399CD217F1B5049e1Ce64A1',
      base:'0xC36442b4a4522E871399CD217F1B5049e1Ce64A1',
      arbitrum:'0xC36442b4a4522E871399CD217F1B5049e1Ce64A1',
      robinhood:'0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3'
    };
    return map[this.chain];
  }
  private async factoryAddress(): Promise<string> {
    const map: Record<Chain,string> = {
      ethereum:'0x1F98431c8aD98523631AE4a59f267346ea31F984',
      base:'0x1F98431c8aD98523631AE4a59f267346ea31F984',
      arbitrum:'0x1F98431c8aD98523631AE4a59f267346ea31F984',
      robinhood:'0x1f7d7550b1b028f7571e69a784071f0205fd2efa'
    };
    return map[this.chain];
  }
}
