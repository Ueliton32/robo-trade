'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Bot, RefreshCw, Zap, Clock, Activity, AlertTriangle, PauseCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarketCard } from '@/components/dashboard/market-card';
import { StrategyPanel } from '@/components/dashboard/strategy-panel';
import { AlertPanel } from '@/components/dashboard/alert-panel';
import { toast } from 'sonner';

export default function DashboardPage() {
  const { data: session } = useSession() || {};
  const [marketData, setMarketData] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [stats, setStats] = useState<any[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [tradeMode, setTradeMode] = useState<'day' | 'swing' | 'both'>('both');
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [positionSettings, setPositionSettings] = useState<{ accountCapital: number | null; riskPerTradePercent: number }>({ accountCapital: null, riskPerTradePercent: 0.5 });

  const [pilotStatus, setPilotStatus] = useState<any>(null);
  const [showPilotLog, setShowPilotLog] = useState(false);

  const fetchPilotStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/pilot/status');
      const json = await res.json();
      if (res.ok) setPilotStatus(json);
    } catch (e: any) { console.error(e); }
  }, []);

  const fetchPositionSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      const json = await res.json();
      setPositionSettings({
        accountCapital: json?.settings?.accountCapital ?? null,
        riskPerTradePercent: json?.settings?.riskPerTradePercent ?? 0.5,
      });
    } catch (e: any) { console.error(e); }
  }, []);

  const fetchMarketData = useCallback(async () => {
    try {
      const res = await fetch('/api/market-data');
      const json = await res.json();
      setMarketData(json?.data ?? []);
      setLastUpdate(new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }));
    } catch (e: any) { console.error(e); }
  }, []);

  const fetchSignals = useCallback(async () => {
    try {
      const res = await fetch('/api/signals?limit=50');
      const json = await res.json();
      setSignals(json?.signals ?? []);
    } catch (e: any) { console.error(e); }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/strategies/stats');
      const json = await res.json();
      setStats(json?.stats ?? []);
    } catch (e: any) { console.error(e); }
  }, []);

  const runAnalysis = useCallback(async () => {
    setAnalyzing(true);
    try {
      const res = await fetch('/api/strategies/analyze', { method: 'POST' });
      const json = await res.json();
      if ((json?.saved ?? 0) > 0) {
        toast.success(`${json.saved} novo(s) sinal(is) gerado(s)!`, { description: 'Verifique o painel de alertas.' });
      } else {
        toast.info('Análise concluída. Nenhum novo sinal no momento.');
      }
      await fetchSignals();
    } catch (e: any) {
      toast.error('Erro na análise');
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  }, [fetchSignals]);

  useEffect(() => {
    fetchMarketData();
    fetchSignals();
    fetchStats();
    fetchPositionSettings();
    fetchPilotStatus();
    const marketInterval = setInterval(fetchMarketData, 15000);
    const signalInterval = setInterval(fetchSignals, 30000);
    const pilotInterval = setInterval(fetchPilotStatus, 60000);
    return () => { clearInterval(marketInterval); clearInterval(signalInterval); clearInterval(pilotInterval); };
  }, [fetchMarketData, fetchSignals, fetchStats, fetchPilotStatus]);

  function timeAgo(iso: string | null): string {
    if (!iso) return 'nunca';
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (minutes < 1) return 'agora mesmo';
    if (minutes < 60) return `${minutes}min atrás`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h atrás`;
    return `${Math.round(hours / 24)}d atrás`;
  }

  const EVENT_LABELS: Record<string, string> = {
    CYCLE_ERROR: 'Erro de ciclo', CYCLE_RECOVERED: 'Ciclo recuperado',
    DIVERGENCE_DETECTED: 'Divergência detectada', AUTO_PAUSE: 'Pausa automática',
    MANUAL_PAUSE: 'Pausa manual', MANUAL_RESUME: 'Reativação manual',
    STABILITY_SCAN: 'Scan de estabilidade', HEARTBEAT_GAP: 'Gap de heartbeat',
    WEEKLY_DIGEST: 'Resumo semanal',
  };

  const activeSignals = (signals ?? []).filter((s: any) => s?.status === 'PENDENTE');
  const filteredSignals = tradeMode === 'both' ? activeSignals : activeSignals.filter((s: any) => {
    if (tradeMode === 'day') return s?.mode === 'Day Trade';
    return s?.mode === 'Swing Trade';
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="w-6 h-6 text-primary" /> Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bem-vindo, <span className="text-foreground">{session?.user?.name ?? 'Trader'}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span suppressHydrationWarning>{lastUpdate || '--:--'}</span>
          </div>
          <div className="flex items-center bg-muted rounded-lg overflow-hidden">
            {(['day', 'swing', 'both'] as const).map((m: string) => (
              <button
                key={m}
                onClick={() => setTradeMode(m as any)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${tradeMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {m === 'day' ? 'Day Trade' : m === 'swing' ? 'Swing' : 'Ambos'}
              </button>
            ))}
          </div>
          <Button onClick={runAnalysis} disabled={analyzing} size="sm">
            {analyzing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
            {analyzing ? 'Analisando...' : 'Analisar Agora'}
          </Button>
        </div>
      </div>

      {/* Saúde do Piloto Automático */}
      {pilotStatus && (
        <div className="bg-card/50 border border-border/50 rounded-lg p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-1.5">
                {pilotStatus.alive ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                )}
                <span className="text-xs">
                  Piloto {pilotStatus.alive ? 'ativo' : 'sem sinal'} — último ciclo {timeAgo(pilotStatus.lastCycleAt)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="w-3.5 h-3.5" /> Divergência: {timeAgo(pilotStatus.lastDivergenceCheckAt)}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Activity className="w-3.5 h-3.5" /> Estabilidade: {timeAgo(pilotStatus.lastStabilityScanAt)}
              </div>
              {pilotStatus.pausedCombos > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-yellow-400">
                  <PauseCircle className="w-3.5 h-3.5" /> {pilotStatus.pausedCombos} combinação(ões) pausada(s)
                </div>
              )}
              {pilotStatus.consecutiveFailures > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertTriangle className="w-3.5 h-3.5" /> {pilotStatus.consecutiveFailures} falha(s) seguida(s)
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowPilotLog((v) => !v)}>
              {showPilotLog ? 'Ocultar atividade' : 'Ver atividade recente'}
            </Button>
          </div>
          {showPilotLog && (
            <div className="mt-3 pt-3 border-t border-border/50 space-y-1.5 max-h-48 overflow-y-auto">
              {(pilotStatus.recentEvents ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum evento registrado ainda.</p>
              ) : (
                pilotStatus.recentEvents.map((ev: any) => (
                  <div key={ev.id} className="text-xs flex gap-2">
                    <span className="text-muted-foreground shrink-0">{timeAgo(ev.createdAt)}</span>
                    <Badge variant="outline" className="text-[9px] shrink-0">{EVENT_LABELS[ev.type] ?? ev.type}</Badge>
                    <span className="text-muted-foreground truncate">{ev.message}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {/* Market Cards */}
      <div>
        <h2 className="text-sm font-display text-muted-foreground mb-3">Mercado em Tempo Real</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {(marketData ?? []).map((d: any) => <MarketCard key={d?.symbol} data={d} />)}
          {(marketData?.length ?? 0) === 0 && Array.from({ length: 5 }).map((_, i: number) => (
            <div key={i} className="bg-card/50 rounded-lg h-[140px] animate-pulse" />
          ))}
        </div>
      </div>

      {/* Alerts + Strategies */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <AlertPanel signals={filteredSignals} />
        </div>
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-display text-muted-foreground">Estratégias</h2>
            <Badge variant="outline" className="text-xs">{stats?.length ?? 0} ativas</Badge>
          </div>
          {(stats ?? []).map((st: any) => {
            const stratSignals = (signals ?? []).filter((s: any) => s?.strategyId === st?.strategyId);
            const activeCount = stratSignals.filter((s: any) => s?.status === 'PENDENTE')?.length ?? 0;
            return <StrategyPanel key={st?.strategyId} stats={st} signals={stratSignals} activeSignalCount={activeCount} positionSettings={positionSettings} />;
          })}
          {(stats?.length ?? 0) === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Carregando estratégias...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
