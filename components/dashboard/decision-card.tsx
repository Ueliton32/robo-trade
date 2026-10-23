'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DecisionReport } from '@/types/dashboard';
import { CheckCircle2, XCircle, AlertCircle, Info } from 'lucide-react';

interface DecisionCardProps {
  report: DecisionReport;
}

export function DecisionCard({ report }: DecisionCardProps) {
  const statusColors = {
    HEALTHY: 'text-emerald-400',
    WATCH: 'text-yellow-400',
    REVIEW: 'text-orange-400',
    STRONG_CANDIDATE: 'text-emerald-400',
    ROTATE_CANDIDATE: 'text-blue-400',
    UNHEALTHY: 'text-red-400',
  };

  return (
    <Card className="bg-card/50">
      <CardHeader>
        <CardTitle className="text-sm font-display">Decision Report</CardTitle>
        <CardDescription className="text-xs">
          Última atualização: {new Date(report.timestamp * 1000).toLocaleString('pt-BR')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <Badge variant="outline" className={`${statusColors[report.status.status] || ''}`}>
            {report.status.status}
          </Badge>
        </div>

        <div>
          <span className="text-sm text-muted-foreground">Reason</span>
          <p className="text-sm mt-1">{report.status.status_reason}</p>
        </div>

        <div>
          <span className="text-sm text-muted-foreground">Confiança</span>
          <p className="text-sm mt-1">{report.risk.confidence}%</p>
        </div>

        {report.status.watch_items.length > 0 && (
          <div>
            <span className="text-sm text-muted-foreground">Watch Items</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {report.status.watch_items.map((item) => (
                <Badge key={item} variant="outline" className="text-[10px]">
                  {item}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {report.explainability.triggered_rules.length > 0 && (
          <div>
            <span className="text-sm text-muted-foreground">Regras Disparadas</span>
            <div className="space-y-1 mt-2">
              {report.explainability.triggered_rules.map((ruleId) => (
                <div key={ruleId} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>{ruleId}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
