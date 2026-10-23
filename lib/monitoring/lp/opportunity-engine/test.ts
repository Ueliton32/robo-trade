import { liquidityScore, feeScore, riskScore, capitalEfficiencyScore, opportunityScore } from './scorer';

function testScoring() {
  const pool = {
    pool_address: '0x1',
    network: 'robinhood',
    tvl: 1000000,
    volume_24h: 100000,
    liquidity: 500000,
    fee_tier: 500, // 0.05%
    timestamp_ms: Date.now()
  };
  const ls = liquidityScore(pool);
  const fs = feeScore(pool);
  const rs = riskScore(pool);
  const cs = capitalEfficiencyScore(pool);
  const os = opportunityScore(pool);
  console.log(`Liquidity: ${ls}`);
  console.log(`Fee: ${fs}`);
  console.log(`Risk: ${rs}`);
  console.log(`Capital: ${cs}`);
  console.log(`Opportunity: ${os}`);
  // Basic bounds
  console.assert(ls >= 0 && ls <= 100, 'liquidity score out of bounds');
  console.assert(fs >= 0 && fs <= 100, 'fee score out of bounds');
  console.assert(rs >= 0 && rs <= 100, 'risk score out of bounds');
  console.assert(cs >= 0 && cs <= 100, 'capital efficiency score out of bounds');
  console.assert(os >= 0 && os <= 100, 'opportunity score out of bounds');
  console.log('All tests passed');
}

testScoring();
