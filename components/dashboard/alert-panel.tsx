'use client';
import { Bell, ArrowUpCircle, ArrowDownCircle, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatPrice } from '@/lib/utils';

interface Signal {
  id: string;
  strategyName: string;
  pair: string;
  direction: string;
  timeframe: string;
  mode: string;
  entryPrice: number;
  confidence: number;
  createdAt: string;
  status: string;
}

export function AlertPanel({ signals, onDismiss }: { signals: Signal[]; onDismiss?: (id: string) => void }) {
  if ((signals?.length ?? 0) === 0) {
    return (
      <Card className="bg-card/80 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> Alertas Recentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum alerta ativo no momento.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/80 border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" /> Alertas Recentes
            <Badge className="bg-primary/20 text-primary text-xs">{signals?.length ?? 0}</Badge>
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2">
            {(signals ?? []).map((s: Signal) => {
              const isLong = s?.direction === 'LONG';
              const timeAgo = getTimeAgo(s?.createdAt);
              return (
                <div key={s?.id} className="flex items-center gap-3 bg-muted/30 rounded-lg p-3 group">
                  {isLong ? <ArrowUpCircle className="w-5 h-5 text-emerald-400 shrink-0" /> : <ArrowDownCircle className="w-5 h-5 text-red-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold">{s?.pair?.replace?.('USDT', '') ?? ''}</span>
                      <Badge variant="outline" className={`text-xs ${isLong ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400'}`}>
                        {s?.direction ?? ''}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{s?.timeframe ?? ''}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{s?.strategyName ?? ''} · {formatPrice(s?.entryPrice)} · {timeAgo}</p>
                  </div>
                  {onDismiss && (
                    <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100" onClick={() => onDismiss(s?.id ?? '')}>
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function getTimeAgo(dateStr: string | undefined): string {
  if (!dateStr) return '';
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  } catch { return ''; }
}