'use client';

import { useCallback, useEffect, useState } from 'react';
import { Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionOfDay } from '@/components/dashboard/action-of-day';
import { ExecutiveAlerts } from '@/components/dashboard/executive-alerts';
import { MarketNow } from '@/components/dashboard/market-now';
import { OpportunityPreview } from '@/components/dashboard/opportunity-preview';
import { PositionSummary } from '@/components/dashboard/position-summary';
import { DecisionReport } from '@/types/dashboard';

export default function DashboardPage() {
  const [report, setReport] = useState<DecisionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/lp/report', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setReport(await response.json());
    } catch (cause) {
      console.error(cause);
      setError('Não foi possível carregar o Decision Report.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadReport(); }, [loadReport]);

  if (loading && !report) {
    return <div className="grid min-h-[65vh] place-items-center"><div className="text-center"><RefreshCw className="mx-auto h-5 w-5 animate-spin text-primary" /><p className="mt-3 text-sm text-muted-foreground">Preparando resumo executivo…</p></div></div>;
  }

  if (!report) {
    return <div className="grid min-h-[65vh] place-items-center"><div className="max-w-sm rounded-2xl border border-rose-400/20 bg-rose-400/5 p-6 text-center"><p className="text-sm font-medium">{error}</p><Button className="mt-4" onClick={() => void loadReport()}>Tentar novamente</Button></div></div>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Resumo executivo</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">O que importa agora</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Decisão, posição, oportunidades e contexto de mercado em uma única leitura.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex"><Clock3 className="h-3.5 w-3.5" /> Atualizado {new Date(report.timestamp * 1000).toLocaleString('pt-BR')}</div>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void loadReport()} className="rounded-xl bg-card/50">
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </header>

      <ActionOfDay report={report} />

      <div className="grid gap-5 xl:grid-cols-[1.05fr_.95fr]">
        <PositionSummary report={report} />
        <ExecutiveAlerts report={report} />
      </div>

      <OpportunityPreview report={report} />
      <MarketNow report={report} />

      <footer className="flex flex-col gap-2 border-t border-border/60 pt-5 text-[10px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>Dados fornecidos exclusivamente pelo Core Engine validado.</span>
        <span>READ ONLY · sem execução financeira · sem métricas recalculadas</span>
      </footer>
    </div>
  );
}
