import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Database, Droplets, Gauge, Shield, Sparkles } from 'lucide-react';
import { getDecisionReport } from '@/lib/dashboard/decision-server';
import { getOpportunityPool } from '@/lib/dashboard/opportunities-server';

function compactMoney(value: number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function scoreTone(value: number | null) {
  if (value === null) return 'text-muted-foreground';
  if (value >= 70) return 'text-emerald-300';
  if (value >= 40) return 'text-amber-300';
  return 'text-rose-300';
}

export default async function OpportunityDetailPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const pool = getOpportunityPool(decodeURIComponent(address));
  if (!pool) notFound();

  const report = getDecisionReport();
  const currentAddress = report.portfolio.current_pool?.pool_address as string | undefined;
  const current = currentAddress ? getOpportunityPool(currentAddress) : null;
  const isCurrent = currentAddress?.toLowerCase() === pool.poolAddress.toLowerCase();
  const factors = [
    { label: 'Liquidity score', value: pool.liquidityScore, icon: Droplets, explanation: 'Fator produzido pelo Opportunity Engine para representar a qualidade de liquidez disponível.' },
    { label: 'Fee score', value: pool.feeScore, icon: Sparkles, explanation: 'Fator produzido pelo Opportunity Engine a partir das métricas de fees já persistidas.' },
    { label: 'Risk score', value: pool.riskScore, icon: Shield, explanation: 'Fator de risco fornecido diretamente pelo Opportunity Engine.' },
    { label: 'Capital efficiency', value: pool.capitalEfficiencyScore, icon: Gauge, explanation: 'Eficiência de capital conforme o snapshot calculado pelo Core.' },
  ];

  return (
    <div className="space-y-6">
      <header className="border-b border-border/60 pb-5">
        <Link href="/lp/opportunities" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="h-3.5 w-3.5" /> Voltar para Opportunities</Link>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">Pool detail</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{pool.token0Symbol} / {pool.token1Symbol}</h1><p className="mt-2 font-mono text-[11px] text-muted-foreground">{pool.poolAddress}</p></div>
          <div className="flex items-center gap-3"><div className="rounded-xl border border-border/70 bg-card/55 px-4 py-3 text-right"><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Opportunity Score</p><p className={`mt-1 font-mono text-3xl font-semibold ${scoreTone(pool.opportunityScore)}`}>{pool.opportunityScore ?? '—'}</p></div>{isCurrent && <span className="rounded-lg border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary">SUA POOL</span>}</div>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {factors.map(({ label, value, icon: Icon, explanation }) => <div key={label} className="rounded-2xl border border-border/70 bg-card/55 p-5"><div className="flex items-center justify-between"><Icon className="h-4 w-4 text-muted-foreground" /><span className={`font-mono text-xl font-semibold ${scoreTone(value)}`}>{value ?? '—'}</span></div><h2 className="mt-4 text-sm font-semibold">{label}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{explanation}</p></div>)}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/55 p-5">
        <div className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /><h2 className="font-semibold">Métricas fornecidas pelo Pool Scanner</h2></div>
        <div className="mt-5 grid gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
          {[['TVL', compactMoney(pool.tvl)], ['Volume 24h', compactMoney(pool.volume24h)], ['APR', pool.apr === null ? '—' : `${pool.apr.toFixed(2)}%`], ['Liquidez', compactMoney(pool.liquidity)], ['Pool score', pool.poolScore ?? '—'], ['Fee tier', pool.feeTier ?? '—'], ['Chain', pool.network], ['Protocol', pool.protocol]].map(([label, value]) => <div key={label} className="bg-card p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-2 font-mono text-sm font-medium">{value}</p></div>)}
        </div>
      </section>

      {current && !isCurrent && <section className="rounded-2xl border border-border/70 bg-card/55 p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Comparação direta</p><h2 className="mt-2 font-semibold">Esta pool vs sua pool atual</h2><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><tr><th className="pb-3">Pool</th><th className="pb-3">Score</th><th className="pb-3">TVL</th><th className="pb-3">Volume 24h</th><th className="pb-3">Risco</th><th className="pb-3">Eficiência</th></tr></thead><tbody>{[pool, current].map((item) => <tr key={item.poolAddress} className="border-t border-border/60"><td className="py-4 font-medium">{item.token0Symbol} / {item.token1Symbol}{item.poolAddress === current.poolAddress && <span className="ml-2 text-[9px] text-primary">ATUAL</span>}</td><td className="py-4 font-mono">{item.opportunityScore ?? '—'}</td><td className="py-4 font-mono">{compactMoney(item.tvl)}</td><td className="py-4 font-mono">{compactMoney(item.volume24h)}</td><td className="py-4 font-mono">{item.riskScore ?? '—'}</td><td className="py-4 font-mono">{item.capitalEfficiencyScore ?? '—'}</td></tr>)}</tbody></table></div></section>}

      <section className="rounded-2xl border border-border/70 bg-card/55 p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Provenance</p><div className="mt-4 grid gap-3 text-xs sm:grid-cols-3"><div><p className="text-muted-foreground">Origem</p><p className="mt-1">{pool.provenance}</p></div><div><p className="text-muted-foreground">Snapshot da pool</p><p className="mt-1 font-mono">{pool.snapshotTs ? new Date(pool.snapshotTs * 1000).toLocaleString('pt-BR') : '—'}</p></div><div><p className="text-muted-foreground">Snapshot do score</p><p className="mt-1 font-mono">{pool.opportunityTs ? new Date(pool.opportunityTs * 1000).toLocaleString('pt-BR') : '—'}</p></div></div></section>
    </div>
  );
}
