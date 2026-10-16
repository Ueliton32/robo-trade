const { ethers } = require('ethers');
const rpc = 'https://rpc.mainnet.chain.robinhood.com';
const provider = new ethers.JsonRpcProvider(rpc);
const manager = '0x73991a25C818Bf1f1128dEAaB1492D45638DE0D3';
const abi = [
  'function ownerOf(uint256) view returns (address)',
  'function positions(uint256) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)'
];
(async () => {
  const contract = new ethers.Contract(manager, abi, provider);
  try {
    const owner = await contract.ownerOf(1370217);
    console.log('ownerOf', owner);
  } catch(e){ console.error('ownerOf err', e.message); }
  try {
    const pos = await contract.positions(1370217);
    console.log('positions', pos);
  } catch(e){ console.error('positions err', e.message); }
})();
