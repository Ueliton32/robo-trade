'use client';
import { ArrowUpCircle, ArrowDownCircle, Clock, Target, ShieldAlert, Zap, Calculator } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/utils';

interface Signal {
  id: string;
  strategyId: number;
  strategyName: string;
  pair: string;
  direction: string;
  timeframe: string;
  mode: string;
  entryPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  leverage: string;
  confidence: number;
  reason: string;
  status: string;
  result: string | null;
  pnlPercent: number | null;
  createdAt: string;
}

interface PositionSettings {
  accountCapital: number | null;
  riskPerTradePercent: number;
}

export function SignalCard({ signal, positionSettings }: { signal: Signal; positionSettings?: PositionSettings }) {
  const isLong = signal?.direction === 'LONG';
  const statusColor = signal?.status === 'PENDENTE' ? 'bg-yellow-500/20 text-yellow-400' : signal?.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : signal?.status === 'LOSS' ? 'bg-red-500/20 text-red-400' : 'bg-muted text-muted-foreground';

  const capital = positionSettings?.accountCapital ?? null;
  const riskPct = positionSettings?.riskPerTradePercent ?? 0.5;
  const entry = signal?.entryPrice ?? 0;
  const stop = signal?.stopLoss ?? 0;
  const priceDistance = Math.abs(entry - stop);
  const showCalc = capital !== null && capital > 0 && priceDistance > 0;

  const riskAmount = showCalc ? (capital as number) * (riskPct / 100) : 0;
  const positionUnits = showCalc ? riskAmount / priceDistance : 0;
  const positionNotional = showCalc ? positionUnits * entry : 0;

  return (
    <Card className="bg-card/80 border-border/50 hover:border-primary/20 transition-all duration-300">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {isLong ? <ArrowUpCircle className="w-5 h-5 text-emerald-400" /> : <ArrowDownCircle className="w-5 h-5 text-red-400" />}
            <span className="font-display font-bold">{signal?.pair?.replace?.('USDT', '/USDT') ?? ''}</span>
            <Badge variant="outline" className={`text-xs ${isLong ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400'}`}>
              {signal?.direction ?? ''}
            </Badge>
          </div>
          <Badge className={`text-xs ${statusColor}`}>{signal?.status ?? ''}</Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="w-3 h-3" />
            {signal?.timeframe ?? ''} · {signal?.mode ?? ''}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Zap className="w-3 h-3" />
            Alav. {signal?.leverage ?? ''}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs font-mono">
          <div>
            <span className="block text-muted-foreground mb-1">Entrada</span>
            <span>{formatPrice(signal?.entryPrice)}</span>
          </div>
          <div>
            <span className="block text-emerald-400/70 mb-1">Alvo 1</span>
            <span className="text-emerald-400">{formatPrice(signal?.target1)}</span>
          </div>
          <div>
            <span className="block text-emerald-400/70 mb-1">Alvo 2</span>
            <span className="text-emerald-400">{formatPrice(signal?.target2)}</span>
          </div>
          <div>
            <span className="block text-red-400/70 mb-1">Stop</span>
            <span className="text-red-400">{formatPrice(signal?.stopLoss)}</span>
          </div>
        </div>

        {showCalc ? (
          <div className="mt-3 flex items-center gap-2 text-xs bg-primary/10 border border-primary/20 rounded-lg p-2">
            <Calculator className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-muted-foreground">
              Tamanho sugerido (risco {riskPct}%): <span className="text-foreground font-mono font-bold">{positionUnits.toFixed(4)} {signal?.pair?.replace?.('USDT', '') ?? ''}</span>
              <span className="text-muted-foreground"> (~${positionNotional.toFixed(2)}, arriscando ${riskAmount.toFixed(2)})</span>
            </span>
          </div>
        ) : (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Configure seu capital em Configurações para ver o tamanho de posição sugerido aqui.
          </p>
        )}

        <div className="mt-3 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1">
            <Target className="w-3 h-3 text-primary" />
            <span className="text-muted-foreground">Confiança: <span className="text-foreground font-mono">{signal?.confidence ?? 0}%</span></span>
          </div>
          <span className="text-muted-foreground">{signal?.strategyName ?? ''}</span>
        </div>

        {signal?.reason && (
          <p className="mt-2 text-xs text-muted-foreground bg-muted/30 rounded p-2">
            <ShieldAlert className="w-3 h-3 inline mr-1" />
            {signal.reason}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
