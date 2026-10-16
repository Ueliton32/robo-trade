import Database from 'better-sqlite3';
import { join } from 'path';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const SNAPSHOT_DB = join(process.cwd(), 'lib/monitoring/lp/v13/snapshots.db');

export default async function SnapshotsPage() {
  let rows: any[] = [];
  
  try {
    const db = new Database(SNAPSHOT_DB);
    rows = db.prepare(`
      SELECT s.* FROM snapshots s
      ORDER BY s.ts DESC LIMIT 100
    `).all();
  } catch (e) {
    console.error(e);
  }
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Snapshots</h1>
      
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm">History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-2">Timestamp</th>
                  <th className="text-left p-2">Value</th>
                  <th className="text-left p-2">Alpha %</th>
                  <th className="text-left p-2">P&L</th>
                  <th className="text-left p-2">In Range</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/50">
                    <td className="p-2 font-mono">{new Date(row.ts * 1000).toLocaleString('pt-BR')}</td>
                    <td className="p-2 font-mono">${row.value_usd || '-'}</td>
                    <td className="p-2 font-mono">{row.lp_alpha_pct || '-'}%</td>
                    <td className="p-2 font-mono">${row.lp_net_pnl || '-'}</td>
                    <td className="p-2">{row.in_range ? 'YES' : 'NO'}</td>
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
