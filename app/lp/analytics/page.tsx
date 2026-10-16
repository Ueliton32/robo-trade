import { getDecisionReport } from '@/lib/dashboard/decision-server';

export default function AnalyticsPage() {
  const report = getDecisionReport();
  const position = report.portfolio.current_position;
  const pool = report.portfolio.current_pool;
  const technical = [
    ['Current tick', position?.current_tick ?? '—'],
    ['Tick lower', position?.tick_lower ?? '—'],
    ['Tick upper', position?.tick_upper ?? '—'],
    ['Fee tier', pool?.fee_tier ?? '—'],
    ['Liquidity score', report.opportunity.liquidity_score],
    ['Fee score', report.opportunity.fee_score],
    ['Risk score', report.opportunity.risk_score],
    ['Capital efficiency', report.opportunity.capital_efficiency],
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Technical workspace</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Analytics</h1>
        <p className="mt-2 text-sm text-muted-foreground">Métricas brutas para auditoria técnica e investigação.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {technical.map(([label, value]) => <div key={label} className="rounded-2xl border border-border/70 bg-card/55 p-5"><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-3 font-mono text-xl font-semibold">{value}</p></div>)}
      </div>

      <section className="rounded-2xl border border-border/70 bg-card/55 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Provenance & freshness</p>
        <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(report.provenance.freshness).map(([source, age]) => <div key={source} className="bg-card p-4"><p className="text-xs capitalize text-muted-foreground">{source}</p><p className="mt-2 font-mono text-sm">{age < 0 ? 'indisponível' : `${age}s`}</p></div>)}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/55 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Raw Decision Report</p>
        <pre className="mt-4 max-h-[520px] overflow-auto rounded-xl bg-black/30 p-4 text-[11px] leading-5 text-muted-foreground">{JSON.stringify(report, null, 2)}</pre>
      </section>
    </div>
  );
}
