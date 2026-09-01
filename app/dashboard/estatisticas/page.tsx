'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart3, Filter, RefreshCw, Info, CalendarClock, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import { formatPrice } from '@/lib/utils';

const StatsCharts = dynamic(() => import('@/components/dashboard/stats-charts'), { ssr: false, loading: () => <div className="h-[300px] bg-card/50 rounded-lg animate-pulse" /> });

const MIN_TRADES_CONFIAVEL = 30;

const PERIOD_OPTIONS = [
  { value: 'all', label: 'Histórico completo' },
  { value: '1', label: 'Últimas 24h' },
  { value: '3', label: 'Últimos 3 dias' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '14', label: 'Últimos 14 dias' },
  { value: '30', label: 'Últimos 30 dias' },
];

export default function EstatisticasPage() {
  const [stats, setStats] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [closedSignals, setClosedSignals] = useState<any[]>([]);
  const [recalculating, setRecalculating] = useState(false);
  const [period, setPeriod] = useState('all');
  const [loadingStats, setLoadingStats] = useState(false);
  const [positionSettings, setPositionSettings] = useState<{ accountCapital: number | null; riskPerTradePercent: number }>({ accountCapital: null, riskPerTradePercent: 0.5 });

  const sinceISO = useMemo(() => {
    if (period === 'all') return null;
    const days = Number(period);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }, [period]);

  const load = useCallback(async () => {
    setLoadingStats(true);
    try {
      const statsUrl = sinceISO ? `/api/strategies/stats?since=${encodeURIComponent(sinceISO)}` : '/api/strategies/stats';
      const closedUrl = `/api/signals?status=WIN,LOSS&limit=500${sinceISO ? `&since=${encodeURIComponent(sinceISO)}` : ''}`;
      const [statsRes, sigRes, closedRes, settingsRes] = await Promise.all([
        fetch(statsUrl),
        fetch('/api/signals?limit=100'),
        fetch(closedUrl),
        fetch('/api/settings'),
      ]);
      const statsJson = await statsRes.json();
      const sigJson = await sigRes.json();
      const closedJson = await closedRes.json();
      const settingsJson = await settingsRes.json();
      setStats(statsJson?.stats ?? []);
      setSignals(sigJson?.signals ?? []);
      setClosedSignals(closedJson?.signals ?? []);
      setPositionSettings({
        accountCapital: settingsJson?.settings?.accountCapital ?? null,
        riskPerTradePercent: settingsJson?.settings?.riskPerTradePercent ?? 0.5,
      });
    } catch (e: any) { console.error(e); }
    finally { setLoadingStats(false); }
  }, [sinceISO]);

  useEffect(() => { load(); }, [load]);

  const recalculate = useCallback(async () => {
    setRecalculating(true);
    try {
      const res = await fetch('/api/strategies/recalculate', { method: 'POST' });
      const json = await res.json();
      if (res.ok) {
        toast.success(`Estatísticas recalculadas. ${json?.closed ?? 0} sinal(is) fechado(s) com dados reais da Binance.`);
        await load();
      } else {
        toast.error(json?.error ?? 'Erro ao recalcular');
      }
    } catch (e: any) {
      toast.error('Erro ao recalcular');
    } finally {
      setRecalculating(false);
    }
  }, [load]);

  const totalTrades = stats.reduce((sum: number, s: any) => sum + (s?.totalTrades ?? 0), 0);

  const capital = positionSettings.accountCapital;
  const riskPct = positionSettings.riskPerTradePercent;
  const hasCapital = capital !== null && capital > 0;

  // Pra cada sinal fechado, calcula quanto teria dado em $ se você tivesse
  // operado com o tamanho de posição que seu capital/risco sugerem — a
  // mesma conta do card no Dashboard, só que aplicada retroativamente.
  const signalsWithDollar = useMemo(() => {
    if (!hasCapital) return closedSignals.map((s: any) => ({ ...s, dollarResult: null }));
    return closedSignals.map((s: any) => {
      const priceDistance = Math.abs((s?.entryPrice ?? 0) - (s?.stopLoss ?? 0));
      if (priceDistance <= 0) return { ...s, dollarResult: null };
      const riskAmount = (capital as number) * (riskPct / 100);
      const positionUnits = riskAmount / priceDistance;
      const positionNotional = positionUnits * (s?.entryPrice ?? 0);
      const dollarResult = positionNotional * ((s?.pnlPercent ?? 0) / 100);
      return { ...s, dollarResult };
    });
  }, [closedSignals, hasCapital, capital, riskPct]);

  const totalDollarResult = useMemo(() => {
    return signalsWithDollar.reduce((sum: number, s: any) => sum + (s?.dollarResult ?? 0), 0);
  }, [signalsWithDollar]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Estatísticas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Comparação detalhada do desempenho das estratégias</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIOD_OPTIONS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={recalculate} disabled={recalculating} size="sm" variant="outline">
            <RefreshCw className={`w-4 h-4 mr-2 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Recalculando...' : 'Recalcular com dados reais'}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-card/50 border border-border/50 rounded-lg p-3">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <p>
          Estes números são calculados apenas a partir de sinais reais gerados pelo robô e fechados
          com base no histórico real de preços da Binance (alvo 1 ou stop atingido) — nada aqui é
          simulado ou fixo. {period !== 'all' && (
            <>Filtrado para <strong>{PERIOD_OPTIONS.find((p) => p.value === period)?.label.toLowerCase()}</strong> — útil pra
            ver o desempenho depois de uma mudança de configuração, sem o histórico de antes misturado no número.{' '}</>
          )}
          {totalTrades > 0 && totalTrades < MIN_TRADES_CONFIAVEL && (
            <>Com apenas <strong>{totalTrades}</strong> trade(s) fechado(s) {period !== 'all' ? 'nesse período' : 'no total'}, a amostra ainda é pequena
            para ter confiança estatística — trate estes números com cautela até acumular mais histórico.</>
          )}
          {totalTrades === 0 && <>Nenhum sinal fechado {period !== 'all' ? 'nesse período' : 'ainda nesta conta'} — assim que o robô gerar sinais e eles baterem no alvo ou no stop, os números aparecem aqui automaticamente.</>}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total de Trades" value={totalTrades} />
        <SummaryCard label="Total Wins" value={stats.reduce((sum: number, s: any) => sum + (s?.wins ?? 0), 0)} color="text-emerald-400" />
        <SummaryCard label="Total Losses" value={stats.reduce((sum: number, s: any) => sum + (s?.losses ?? 0), 0)} color="text-red-400" />
        <SummaryCard
          label="Win Rate Geral"
          value={totalTrades > 0 ? `${((stats.reduce((sum: number, s: any) => sum + (s?.wins ?? 0), 0) / totalTrades) * 100).toFixed(1)}%` : '—'}
          color="text-primary"
        />
      </div>

      {/* Charts */}
      <StatsCharts stats={stats} signals={signals} />

      {/* Table */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <Filter className="w-4 h-4" /> Tabela Comparativa
            {loadingStats && <RefreshCw className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estratégia</TableHead>
                  <TableHead className="text-right">Win Rate</TableHead>
                  <TableHead className="text-right">Payoff</TableHead>
                  <TableHead className="text-right">Fator Lucro</TableHead>
                  <TableHead className="text-right">Drawdown</TableHead>
                  <TableHead className="text-right">Expectativa</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">W/L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stats ?? []).map((s: any) => {
                  const hasData = (s?.totalTrades ?? 0) > 0;
                  if (!hasData) {
                    return (
                      <TableRow key={s?.strategyId}>
                        <TableCell className="font-medium text-sm">{s?.strategyName ?? ''}</TableCell>
                        <TableCell colSpan={7} className="text-right text-xs text-muted-foreground">Sem trades fechados {period !== 'all' ? 'nesse período' : 'ainda'}</TableCell>
                      </TableRow>
                    );
                  }
                  return (
                    <TableRow key={s?.strategyId}>
                      <TableCell className="font-medium text-sm">{s?.strategyName ?? ''}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className={(s?.winRate ?? 0) >= 55 ? 'text-emerald-400' : 'text-yellow-400'}>{(s?.winRate ?? 0)?.toFixed?.(1)}%</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{(s?.payoff ?? 0)?.toFixed?.(2)}x</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className={(s?.profitFactor ?? 0) >= 1.5 ? 'text-emerald-400' : 'text-yellow-400'}>{(s?.profitFactor ?? 0)?.toFixed?.(2)}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-400">{(s?.maxDrawdown ?? 0)?.toFixed?.(1)}%</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <span className={(s?.expectancy ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>{(s?.expectancy ?? 0) >= 0 ? '+' : ''}{(s?.expectancy ?? 0)?.toFixed?.(2)}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {s?.totalTrades ?? 0}
                        {(s?.totalTrades ?? 0) < MIN_TRADES_CONFIAVEL && (
                          <Badge variant="outline" className="ml-1 text-[10px] border-yellow-500/40 text-yellow-400">amostra pequena</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">{s?.wins ?? 0}</Badge>
                          <Badge className="bg-red-500/20 text-red-400 text-xs">{s?.losses ?? 0}</Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Sinais Fechados + resultado em $ */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Histórico de Sinais Fechados
          </CardTitle>
          <CardDescription>
            {hasCapital
              ? `Resultado retroativo em $ se você tivesse operado cada um com o tamanho sugerido (capital de $${capital?.toFixed(2)}, risco de ${riskPct}% por operação) — não é o que você ganhou de verdade, é uma simulação.`
              : 'Configure seu capital em Configurações para ver o resultado em $ de cada sinal fechado, não só em %.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasCapital && closedSignals.length > 0 && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 mb-4">
              <p className="text-xs text-muted-foreground mb-1">Resultado total simulado {period !== 'all' ? 'no período' : '(histórico completo)'}</p>
              <p className={`text-2xl font-mono font-bold ${totalDollarResult >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalDollarResult >= 0 ? '+' : ''}${totalDollarResult.toFixed(2)}
              </p>
            </div>
          )}
          {closedSignals.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum sinal fechado {period !== 'all' ? 'nesse período' : 'ainda'}.</p>
          ) : (
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Par</TableHead>
                    <TableHead>Estratégia</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Entrada</TableHead>
                    <TableHead className="text-right">PnL %</TableHead>
                    {hasCapital && <TableHead className="text-right">Resultado $</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signalsWithDollar.slice(0, 100).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs">{new Date(s.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell className="font-mono text-xs">{s.pair?.replace?.('USDT', '/USDT')}</TableCell>
                      <TableCell className="text-xs">{s.strategyName}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${s.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{formatPrice(s.entryPrice)}</TableCell>
                      <TableCell className={`text-right font-mono text-xs ${(s.pnlPercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(s.pnlPercent ?? 0) >= 0 ? '+' : ''}{(s.pnlPercent ?? 0).toFixed(2)}%
                      </TableCell>
                      {hasCapital && (
                        <TableCell className={`text-right font-mono text-xs font-bold ${(s.dollarResult ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {s.dollarResult !== null ? `${s.dollarResult >= 0 ? '+' : ''}$${s.dollarResult.toFixed(2)}` : '—'}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {signalsWithDollar.length > 100 && (
                <p className="text-xs text-muted-foreground mt-2">Mostrando os 100 mais recentes de {signalsWithDollar.length} — o total acima já soma todos, não só os exibidos.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <Card className="bg-card/80 border-border/50">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`font-mono text-2xl font-bold mt-1 ${color ?? 'text-foreground'}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
