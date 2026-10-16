import { DecisionReport } from '@/types/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { getDecisionReport } from '@/lib/dashboard/decision-server';

export default function DecisionPage() {
  const report = getDecisionReport();
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold">Decision Report</h1>
      
      <Card className="bg-card/50">
        <CardHeader>
          <CardTitle className="text-sm">Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Decision</span>
            <Badge variant="outline">{report.status.status}</Badge>
          </div>
          
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Confidence</span>
            <span className="text-sm font-mono">{report.risk.confidence}%</span>
          </div>
          
          <div>
            <span className="text-sm text-muted-foreground">Reason</span>
            <p className="text-sm mt-1">{report.status.status_reason}</p>
          </div>
          
          <div>
            <span className="text-sm text-muted-foreground">Watch Items</span>
            <div className="flex flex-wrap gap-1 mt-2">
              {report.status.watch_items.map((item) => (
                <Badge key={item} variant="outline" className="text-xs">{item}</Badge>
              ))}
            </div>
          </div>
          
          <div>
            <span className="text-sm text-muted-foreground">Triggered Rules</span>
            <div className="space-y-1 mt-2">
              {report.explainability.triggered_rules.map((rule) => (
                <div key={rule} className="text-xs font-mono">{rule}</div>
              ))}
            </div>
          </div>
          
          <div>
            <span className="text-sm text-muted-foreground">Metrics Used</span>
            <div className="flex flex-wrap gap-1 mt-2">
              {report.explainability.metrics_used.map((metric) => (
                <Badge key={metric} variant="secondary" className="text-xs">{metric}</Badge>
              ))}
            </div>
          </div>
          
          <div>
            <span className="text-sm text-muted-foreground">Provenance</span>
            <div className="text-xs mt-1">
              <div>Sources: {report.provenance.sources.join(', ')}</div>
              <div>Timestamp: {new Date(report.timestamp * 1000).toLocaleString('pt-BR')}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
