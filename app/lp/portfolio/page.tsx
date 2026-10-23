import { MetricCard } from '@/components/dashboard/metric-card';
import { RegimeBadge } from '@/components/dashboard/regime-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, TrendingUp, TrendingDown, Activity, Zap } from 'lucide-react';
import { DecisionReport } from '@/types/dashboard';

import { getDecisionReport } from '@/lib/dashboard/decision-server';

export default function PortfolioPage() {
  const report = getDecisionReport();
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Portfolio</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <MetricCard title="Portfolio Value" value={`$${(report.portfolio.portfolio_value || 0).toFixed(2)}`} icon={DollarSign} />
        <MetricCard title="LP Alpha %" value={`${(report.portfolio.lp_alpha_pct || 0).toFixed(2)}%`} icon={TrendingUp} variant={(report.portfolio.lp_alpha_pct || 0) >= 0 ? 'success' : 'danger'} />
        <MetricCard title="Fees Accrued" value={`$${(report.portfolio.fees || 0).toFixed(2)}`} icon={Zap} />
        <MetricCard title="P&L" value={`$${(report.portfolio.portfolio_pnl || 0).toFixed(2)}`} icon={TrendingUp} variant={(report.portfolio.portfolio_pnl || 0) >= 0 ? 'success' : 'danger'} />
      </div>

      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm">Position Details</CardTitle>
        </CardHeader>
        <CardContent>
          {report.portfolio.current_position ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Position ID</span>
                <span className="font-mono">{report.portfolio.current_position.position_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">In Range</span>
                <span>{report.portfolio.current_position.in_range ? 'YES' : 'NO'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Current Tick</span>
                <span className="font-mono">{report.portfolio.current_position.current_tick ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tick Lower</span>
                <span className="font-mono">{report.portfolio.current_position.tick_lower ?? '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tick Upper</span>
                <span className="font-mono">{report.portfolio.current_position.tick_upper ?? '-'}</span>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No position data</div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm">Regime Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <RegimeBadge label="Crypto" regime={report.market_context.crypto_regime} />
            <RegimeBadge label="Macro" regime={report.market_context.macro_regime} />
            <RegimeBadge label="Market" regime={report.market_context.market_regime} />
            <RegimeBadge label="Liquidity" regime={report.market_context.liquidity_regime} />
            <RegimeBadge label="Tokenization" regime={report.market_context.tokenization_regime} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
