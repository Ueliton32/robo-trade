import { Compass, Database } from 'lucide-react';
import { OpportunitiesDiscovery } from '@/components/dashboard/opportunities-discovery';
import { getDecisionReport } from '@/lib/dashboard/decision-server';
import { getOpportunityDiscoveryData } from '@/lib/dashboard/opportunities-server';

export default function OpportunitiesPage() {
  const data = getOpportunityDiscoveryData();
  const report = getDecisionReport();
  const currentPoolAddress = report.portfolio.current_pool?.pool_address ?? null;
  const cryptoRegime = report.market_context.crypto_regime;
  const marketLabel = cryptoRegime ? `${cryptoRegime.state} · ${cryptoRegime.confidence}%` : 'Regime indisponível';

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"><Compass className="h-3.5 w-3.5" /> Discovery center</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Opportunities</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Descubra, compare e acompanhe pools usando exclusivamente os snapshots do Pool Scanner, Opportunity Engine e Cross Market Intelligence.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/50 px-3 py-2 text-[11px] text-muted-foreground"><Database className="h-3.5 w-3.5" /> {data.pools.length} pools · snapshot {data.latestSnapshotTs ? new Date(data.latestSnapshotTs * 1000).toLocaleString('pt-BR') : 'indisponível'}</div>
      </header>

      <OpportunitiesDiscovery pools={data.pools} networks={data.networks} protocols={data.protocols} currentPoolAddress={currentPoolAddress} marketLabel={marketLabel} />
    </div>
  );
}
