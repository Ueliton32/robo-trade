const { execSync } = require('child_process');
const output = execSync('npx tsx lib/monitoring/lp/cross-market-intelligence/run.ts', { encoding: 'utf8' });
console.log(output);