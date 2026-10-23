'use client';

import { ArrowRight, BadgeCheck, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { DecisionReport } from '@/types/dashboard';

export function OpportunityPreview({ report }: { report: DecisionReport }) {
  const pool = report.portfolio.current_pool;
  const name = pool ? `${pool.token0_symbol ?? 'Token 0'} / ${pool.token1_symbol ?? 'Token 1'}` : 'Pool atual';

  return (
    <section className="rounded-2xl border border-border/70 bg-card/55 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Melhores oportunidades hoje</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">Ranking disponível</h2>
        </div>
        <Link href="/lp/opportunities" className="flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80">Ver ranking <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-border/60">
        <div className="grid grid-cols-[44px_1fr_80px] bg-muted/35 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:grid-cols-[44px_1.4fr_90px_90px_1fr]">
          <span>Rank</span><span>Pool</span><span>Score</span><span className="hidden sm:block">Status</span><span className="hidden sm:block">Motivo</span>
        </div>
        <div className="grid grid-cols-[44px_1fr_80px] items-center px-3 py-4 sm:grid-cols-[44px_1.4fr_90px_90px_1fr]">
          <span className="font-mono text-sm">{report.opportunity.ranking_position || '—'}</span>
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">{name}<BadgeCheck className="h-3.5 w-3.5 text-primary" /></div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Sua pool atual · {pool?.network ?? 'rede não informada'}</p>
          </div>
          <span className="font-mono text-sm font-semibold">{report.opportunity.opportunity_score}</span>
          <span className="hidden text-xs text-emerald-300 sm:block">Monitorada</span>
          <span className="hidden text-xs text-muted-foreground sm:block">Score fornecido pelo Opportunity Engine</span>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/25 p-3 text-xs text-muted-foreground">
        <BarChart3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        O snapshot atual contém somente a oportunidade consolidada da sua pool. Nenhuma alternativa é inventada pela interface.
      </div>
    </section>
  );
}
