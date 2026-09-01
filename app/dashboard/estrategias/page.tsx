'use client';
import { useState, useEffect } from 'react';
import { Layers, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { StrategyPanel } from '@/components/dashboard/strategy-panel';
import { Badge } from '@/components/ui/badge';

export default function EstrategiasPage() {
  const [stats, setStats] = useState<any[]>([]);
  const [signals, setSignals] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, sigRes] = await Promise.all([
          fetch('/api/strategies/stats'),
          fetch('/api/signals?limit=100'),
        ]);
        const statsJson = await statsRes.json();
        const sigJson = await sigRes.json();
        setStats(statsJson?.stats ?? []);
        setSignals(sigJson?.signals ?? []);
      } catch (e: any) { console.error(e); }
    };
    load();
  }, []);

  const filtered = (stats ?? []).filter((s: any) =>
    (s?.strategyName ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-primary" /> Estratégias
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Visão detalhada de cada estratégia de trading</p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar estratégia..." className="pl-9" value={search} onChange={(e: any) => setSearch(e?.target?.value ?? '')} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {(stats ?? []).map((st: any) => {
          const w = st?.wins ?? 0;
          const l = st?.losses ?? 0;
          return (
            <div key={st?.strategyId} className="bg-card/60 rounded-lg p-3 text-center">
              <p className="text-xs text-muted-foreground">{st?.strategyName ?? ''}</p>
              <p className="font-mono text-lg font-bold mt-1">{(st?.winRate ?? 0)?.toFixed?.(1)}%</p>
              <div className="flex justify-center gap-2 mt-1">
                <Badge className="bg-emerald-500/20 text-emerald-400 text-xs">{w}W</Badge>
                <Badge className="bg-red-500/20 text-red-400 text-xs">{l}L</Badge>
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        {filtered.map((st: any) => {
          const stratSignals = (signals ?? []).filter((s: any) => s?.strategyId === st?.strategyId);
          const activeCount = stratSignals.filter((s: any) => s?.status === 'PENDENTE')?.length ?? 0;
          return <StrategyPanel key={st?.strategyId} stats={st} signals={stratSignals} activeSignalCount={activeCount} />;
        })}
      </div>
    </div>
  );
}
