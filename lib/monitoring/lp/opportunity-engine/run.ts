import { OpportunityEngine } from './opportunity-engine';

async function main() {
  const engine = new OpportunityEngine();
  await engine.run('robinhood');
  const top = engine.getTopOpportunities(10, 'robinhood');
  console.log('[OpportunityEngine] Top 10 opportunities:');
  if (top.length > 0) {
    top.forEach((opp, idx) => {
      console.log(`${idx + 1}. ${opp.pool_address} - Score: ${opp.opportunity_score} (L:${opp.liquidity_score} F:${opp.fee_score} R:${opp.risk_score} C:${opp.capital_efficiency_score})`);
    });
  } else {
    console.log('No opportunity data yet');
  }
  const currentPool = '0xd4eb21209c4d6093f80b5b84f5c45cc093ea14a3';
  const opp = engine.getOpportunityForPool(currentPool.toLowerCase(), 'robinhood');
  if (opp) {
    console.log(`Current pool ${currentPool}:`);
    console.log(`  Opportunity Score: ${opp.opportunity_score}`);
    console.log(`  Liquidity: ${opp.liquidity_score}`);
    console.log(`  Fee: ${opp.fee_score}`);
    console.log(`  Risk: ${opp.risk_score}`);
    console.log(`  Capital Efficiency: ${opp.capital_efficiency_score}`);
  } else {
    console.log(`Current pool ${currentPool} not found in opportunity scores`);
    // Debug: list first 5 pool addresses from storage
    const all = engine['storage'].getLatestSnapshots('robinhood');
    console.log('First 5 pool addresses in opportunity storage:');
    all.slice(0,5).forEach((r, i) => {
      console.log(`${i+1}. ${r.pool_address}`);
    });
  }
}

main().catch(console.error);
