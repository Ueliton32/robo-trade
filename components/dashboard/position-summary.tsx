'use client';

import { AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDollarSign, Coins, Crosshair, Layers3 } from 'lucide-react';
import { DecisionReport } from '@/types/dashboard';

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0);
}

export function PositionSummary({ report }: { report: DecisionReport }) {
  const alpha = report.portfolio.lp_alpha ?? report.portfolio.lp_alpha_pct ?? 0;
  const pnl = report.portfolio.portfolio_pnl ?? 0;
  const inRange = report.portfolio.current_position?.in_range;
  const pool = report.portfolio.current_pool;
  const poolName = pool ? `${pool.token0_symbol ?? 'Token 0'} / ${pool.token1_symbol ?? 'Token 1'}` : 'Pool atual';
  const metrics = [
    { label: 'Valor', value: money(report.portfolio.portfolio_value), icon: CircleDollarSign },
    { label: 'LP Alpha', value: `${alpha >= 0 ? '+' : ''}${alpha.toFixed(2)}%`, icon: alpha >= 0 ? ArrowUpRight : ArrowDownRight, positive: alpha >= 0 },
    { label: 'Fees', value: money(report.portfolio.fees), icon: Coins },
    { label: 'P&L', value: money(pnl), icon: pnl >= 0 ? ArrowUpRight : ArrowDownRight, positive: pnl >= 0 },
  ];

  return (
    <section className="rounded-2xl border border-border/70 bg-card/55 p-5 shadow-[0_16px_50px_rgba(0,0,0,.16)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Sua posição</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">{poolName}</h2>
          <p className="mt-1 text-xs text-muted-foreground">Uniswap V3 · {pool?.network ?? 'rede não informada'}</p>
        </div>
        <div className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${inRange ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-rose-400/25 bg-rose-400/10 text-rose-300'}`}>
          {inRange ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {inRange ? 'IN RANGE' : 'OUT OF RANGE'}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-4">
        {metrics.map(({ label, value, icon: Icon, positive }) => (
          <div key={label} className="bg-card/95 p-4">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
            <p className={`mt-2 font-mono text-base font-semibold tracking-tight ${positive === true ? 'text-emerald-300' : positive === false ? 'text-rose-300' : ''}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Layers3 className="h-3.5 w-3.5" /> Ranking: {report.portfolio.portfolio_rank ? `#${report.portfolio.portfolio_rank}` : 'não disponível'}</span>
        <span className="flex items-center gap-1.5"><Crosshair className="h-3.5 w-3.5" /> Tick atual: {report.portfolio.current_position?.current_tick ?? '—'}</span>
      </div>
    </section>
  );
}
