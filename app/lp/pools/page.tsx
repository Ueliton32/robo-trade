import Database from 'better-sqlite3';
import { join } from 'path';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const POOL_DB = join(process.cwd(), 'lib/monitoring/lp/pool-scanner/pools.db');
const OPP_DB = join(process.cwd(), 'lib/monitoring/lp/opportunity-engine/opportunity.db');

export default async function PoolsPage() {
  let pools: any[] = [];
  
  try {
    const db = new Database(POOL_DB);
    const rows = db.prepare(`
      SELECT * FROM pools ORDER BY last_seen_ms DESC LIMIT 50
    `).all();
    pools = rows;
  } catch (e) {
    console.error(e);
  }
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Pools</h1>
      
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm">Pool Ranking</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-2">Pool</th>
                  <th className="text-left p-2">TVL</th>
                  <th className="text-left p-2">Volume 24h</th>
                  <th className="text-left p-2">APR</th>
                  <th className="text-left p-2">Score</th>
                  <th className="text-left p-2">Rank</th>
                </tr>
              </thead>
              <tbody>
                {pools.map((pool) => (
                  <tr key={pool.id} className="border-b border-border/50">
                    <td className="p-2 font-mono">{pool.pool_address || '-'}</td>
                    <td className="p-2 font-mono">${pool.tvl || '-'}</td>
                    <td className="p-2 font-mono">{pool.volume_24h || '-'}</td>
                    <td className="p-2 font-mono">{pool.apr || '-'}</td>
                    <td className="p-2 font-mono">-</td>
                    <td className="p-2">-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
