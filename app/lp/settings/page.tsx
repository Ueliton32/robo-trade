import { getHealthStatus } from '@/lib/dashboard/health';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  const health = getHealthStatus();
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Settings</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm">System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Snapshot DB</span>
              <span className={`text-xs ${health.snapshot_db?.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {health.snapshot_db?.ok ? 'OK' : 'ERROR'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Pool DB</span>
              <span className={`text-xs ${health.pool_db?.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {health.pool_db?.ok ? 'OK' : 'ERROR'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Opportunity DB</span>
              <span className={`text-xs ${health.opportunity_db?.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {health.opportunity_db?.ok ? 'OK' : 'ERROR'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Cross Market DB</span>
              <span className={`text-xs ${health.cross_market_db?.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {health.cross_market_db?.ok ? 'OK' : 'ERROR'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm">Build Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Build Version</span>
              <span className="text-xs font-mono">{health.build_version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Git Tag</span>
              <span className="text-xs font-mono">{health.git_tag}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-muted-foreground">Scheduler</span>
              <span className={`text-xs ${health.scheduler_status === 'running' ? 'text-emerald-400' : 'text-red-400'}`}>
                {health.scheduler_status}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
