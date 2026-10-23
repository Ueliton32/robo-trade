import { Radar, ShieldCheck } from 'lucide-react';
import { AlphaRadar } from '@/components/dashboard/alpha-radar';
import { getDecisionReport } from '@/lib/dashboard/decision-server';
import { getOpportunityDiscoveryData } from '@/lib/dashboard/opportunities-server';
import { getRadarHistory } from '@/lib/dashboard/radar-server';

export default function RadarPage() {
  const report = getDecisionReport();
  const discovery = getOpportunityDiscoveryData();
  const bestAddress = discovery.pools[0]?.poolAddress ?? null;
  const history = getRadarHistory(bestAddress);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"><Radar className="h-3.5 w-3.5" /> Alpha Radar</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Onde está o alpha agora?</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Se houvesse capital novo hoje, esta tela organiza a melhor oportunidade já identificada pelo Core — sem criar novos scores ou cálculos.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/5 px-3 py-2 text-[11px] text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> READ ONLY · Core congelado</div>
      </header>

      <AlphaRadar pools={discovery.pools} report={report} scoreHistory={history.scoreHistory} alphaHistory={history.alphaHistory} />
    </div>
  );
}
