import { DecisionReport } from '@/types/dashboard';
import { RegimeBadge } from '@/components/dashboard/regime-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import { getDecisionReport } from '@/lib/dashboard/decision-server';

export default function MarketPage() {
  const report = getDecisionReport();
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Market Regime</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm">Macro Regime</CardTitle>
          </CardHeader>
          <CardContent>
            {report.market_context.macro_regime ? (
              <RegimeBadge label="State" regime={report.market_context.macro_regime} size="lg" />
            ) : (
              <div className="text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm">Market Regime</CardTitle>
          </CardHeader>
          <CardContent>
            {report.market_context.market_regime ? (
              <RegimeBadge label="State" regime={report.market_context.market_regime} size="lg" />
            ) : (
              <div className="text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm">Crypto Regime</CardTitle>
          </CardHeader>
          <CardContent>
            {report.market_context.crypto_regime ? (
              <RegimeBadge label="State" regime={report.market_context.crypto_regime} size="lg" />
            ) : (
              <div className="text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm">Tokenization Regime</CardTitle>
          </CardHeader>
          <CardContent>
            {report.market_context.tokenization_regime ? (
              <RegimeBadge label="State" regime={report.market_context.tokenization_regime} size="lg" />
            ) : (
              <div className="text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50">
          <CardHeader>
            <CardTitle className="text-sm">Liquidity Regime</CardTitle>
          </CardHeader>
          <CardContent>
            {report.market_context.liquidity_regime ? (
              <RegimeBadge label="State" regime={report.market_context.liquidity_regime} size="lg" />
            ) : (
              <div className="text-sm text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
