'use client';
import { BarChart3, TrendingUp, TrendingDown, Clock, Coins, Timer, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { SignalCard } from './signal-card';

interface StrategyStatsData {
  strategyId: number;
  strategyName: string;
  description: string;
  winRate: number;
  payoff: number;
  profitFactor: number;
  maxDrawdown: number;
  expectancy: number;
  bestAssets: string[];
  bestHours: string[];
  bestTimeframes: string[];
  totalTrades: number;
  wins: number;
  losses: number;
}

interface SignalData {
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

const stratIcons = [BarChart3, TrendingUp, Coins, Activity, TrendingDown, Timer];

export function StrategyPanel({ stats, signals, activeSignalCount, positionSettings }: { stats: StrategyStatsData; signals: SignalData[]; activeSignalCount: number; positionSettings?: { accountCapital: number | null; riskPerTradePercent: number } }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = stratIcons[(stats?.strategyId ?? 1) - 1] ?? BarChart3;
  const hasActive = (activeSignalCount ?? 0) > 0;

  return (
    <Card className={`bg-card/80 border-border/50 transition-all duration-300 ${hasActive ? 'border-primary/40 animate-pulse-glow' : 'hover:border-border'}`}>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${hasActive ? 'bg-primary/20' : 'bg-muted'}`}>
              <Icon className={`w-5 h-5 ${hasActive ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <CardTitle className="text-sm font-display">{stats?.strategyName ?? ''}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-[300px] truncate">{stats?.description ?? ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasActive ? (
              <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">{activeSignalCount} Sinal(is) Ativo(s)</Badge>
            ) : (
              <Badge variant="outline" className="text-xs">Monitorando</Badge>
            )}
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-2">
          {(stats?.totalTrades ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 mb-4">
              Ainda sem trades fechados para esta estratégia. As métricas abaixo aparecem assim que sinais
              reais baterem no alvo ou no stop (calculado com dados reais da Binance).
            </p>
          ) : (stats?.totalTrades ?? 0) < 30 && (
            <p className="text-xs text-yellow-400/90 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-4">
              Apenas {stats.totalTrades} trade(s) fechado(s) — amostra ainda pequena, use estes números com cautela.
            </p>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <StatBox label="Taxa de Acerto" value={`${(stats?.winRate ?? 0)?.toFixed?.(1)}%`} color={((stats?.winRate ?? 0) >= 55 ? 'text-emerald-400' : 'text-yellow-400')} />
            <StatBox label="Payoff" value={`${(stats?.payoff ?? 0)?.toFixed?.(2)}x`} color="text-foreground" />
            <StatBox label="Fator de Lucro" value={`${(stats?.profitFactor ?? 0)?.toFixed?.(2)}`} color={((stats?.profitFactor ?? 0) >= 1.5 ? 'text-emerald-400' : 'text-yellow-400')} />
            <StatBox label="Drawdown Máx" value={`${(stats?.maxDrawdown ?? 0)?.toFixed?.(1)}%`} color="text-red-400" />
            <StatBox label="Expectativa" value={`${(stats?.expectancy ?? 0) >= 0 ? '+' : ''}${(stats?.expectancy ?? 0)?.toFixed?.(2)}`} color={((stats?.expectancy ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')} />
            <StatBox label="Total Trades" value={`${stats?.totalTrades ?? 0}`} color="text-foreground" />
            <StatBox label="Wins" value={`${stats?.wins ?? 0}`} color="text-emerald-400" />
            <StatBox label="Losses" value={`${stats?.losses ?? 0}`} color="text-red-400" />
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-muted/30 rounded-lg p-2">
              <span className="text-xs text-muted-foreground block mb-1">Melhores Ativos</span>
              <div className="flex flex-wrap gap-1">
                {(stats?.bestAssets ?? []).map((a: string) => <Badge key={a} variant="outline" className="text-xs">{a}</Badge>)}
              </div>
            </div>
            <div className="bg-muted/30 rounded-lg p-2">
              <span className="text-xs text-muted-foreground block mb-1">Melhores Horários</span>
              <div className="flex flex-wrap gap-1">
                {(stats?.bestHours ?? []).map((h: string) => <Badge key={h} variant="outline" className="text-xs">{h}</Badge>)}
              </div>
            </div>
            <div className="bg-muted/30 rounded-lg p-2">
              <span className="text-xs text-muted-foreground block mb-1">Timeframes</span>
              <div className="flex flex-wrap gap-1">
                {(stats?.bestTimeframes ?? []).map((t: string) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
              </div>
            </div>
          </div>

          {(signals?.length ?? 0) > 0 && (
            <div>
              <h4 className="text-xs font-display text-muted-foreground mb-2">Últimos Sinais</h4>
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {(signals ?? []).slice(0, 5).map((s: SignalData) => <SignalCard key={s?.id} signal={s} positionSettings={positionSettings} />)}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-2.5">
      <span className="text-xs text-muted-foreground block mb-0.5">{label}</span>
      <span className={`font-mono text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}
