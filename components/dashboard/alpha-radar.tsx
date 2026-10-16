'use client';

import Link from 'next/link';
import { ArrowRight, Bell, CheckCircle2, Clock3, Coins, Database, Gauge, Radar, ShieldAlert, Sparkles, Star, TrendingUp, WalletCards } from 'lucide-react';
import { DecisionReport, MarketRegime } from '@/types/dashboard';
import { OpportunityPool } from '@/lib/dashboard/opportunities-server';
import { RadarAlphaPoint, RadarScorePoint } from '@/lib/dashboard/radar-server';

function money(value: number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value);
}

function poolName(pool: OpportunityPool) {
  return `${pool.token0Symbol} / ${pool.token1Symbol}`;
}

function regimeLabel(regime: MarketRegime | null) {
  if (!regime) return { label: 'Sem dados', tone: 'slate' };
  const state = regime.state.toUpperCase();
  if (['BULLISH', 'BTC_DOMINANT', 'RISK_ON', 'EXPANDING'].includes(state)) return { label: 'Forte', tone: 'emerald' };
  if (['BEARISH', 'RISK_OFF', 'CONTRACTING'].includes(state)) return { label: 'Cautela', tone: 'rose' };
  return { label: 'Neutro', tone: 'amber' };
}

const toneClasses = {
  emerald: 'bg-emerald-400 text-emerald-300',
  amber: 'bg-amber-400 text-amber-300',
  rose: 'bg-rose-400 text-rose-300',
  slate: 'bg-slate-400 text-slate-300',
};

function rawWindow<T extends { ts: number | null }>(rows: T[], days: number) {
  const minimum = Date.now() / 1000 - days * 86400;
  return rows.filter((row) => row.ts !== null && row.ts >= minimum);
}

export function AlphaRadar({ pools, report, scoreHistory, alphaHistory }: { pools: OpportunityPool[]; report: DecisionReport; scoreHistory: RadarScorePoint[]; alphaHistory: RadarAlphaPoint[] }) {
  const best = pools[0] ?? null;
  const currentAddress = report.portfolio.current_pool?.pool_address as string | undefined;
  const current = pools.find((pool) => pool.poolAddress.toLowerCase() === currentAddress?.toLowerCase());
  const currentRank = current ? pools.findIndex((pool) => pool.poolAddress === current.poolAddress) + 1 : null;
  const top10 = pools.slice(0, 10);
  const top5 = pools.slice(0, 5);

  if (!best) return <div className="rounded-2xl border border-border/70 bg-card/55 p-8 text-sm text-muted-foreground">Nenhuma oportunidade disponível no snapshot atual.</div>;

  const reasons = [
    `Lidera o ranking atual com Opportunity Score ${best.opportunityScore ?? 'indisponível'}`,
    `Fee Score fornecido: ${best.feeScore ?? 'indisponível'}`,
    `Capital Efficiency fornecida: ${best.capitalEfficiencyScore ?? 'indisponível'}`,
    `TVL atual: ${money(best.tvl)}`,
    `Regime crypto: ${report.market_context.crypto_regime?.state ?? 'indisponível'}`,
  ];

  const narratives = [
    ['BTC', report.market_context.crypto_regime],
    ['ETH', report.market_context.crypto_regime],
    ['Stablecoins', report.market_context.liquidity_regime],
    ['IA', report.market_context.market_regime],
    ['RWA', report.market_context.tokenization_regime],
    ['Tokenized Stocks', report.market_context.tokenization_regime],
  ] as const;

  const alertItems = [
    `Oportunidade líder atual: ${poolName(best)} — score ${best.opportunityScore ?? '—'}`,
    currentRank ? `Sua pool ocupa a posição #${currentRank} no ranking atual.` : 'Sua pool não está presente no ranking disponível.',
    ...report.status.watch_items,
  ];

  const windows = [
    { label: '24h', scores: rawWindow(scoreHistory, 1), alpha: rawWindow(alphaHistory, 1) },
    { label: '7d', scores: rawWindow(scoreHistory, 7), alpha: rawWindow(alphaHistory, 7) },
    { label: '30d', scores: rawWindow(scoreHistory, 30), alpha: rawWindow(alphaHistory, 30) },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-[radial-gradient(circle_at_15%_10%,hsl(var(--primary)/.2),transparent_38%),linear-gradient(135deg,hsl(var(--card)/.9),hsl(var(--background)/.6))] p-6 sm:p-8">
          <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"><Radar className="h-3.5 w-3.5" /> Oportunidade do dia</div><span className="rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">TOP 1</span></div>
          <h2 className="mt-7 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">{poolName(best)}</h2>
          <p className="mt-2 text-sm uppercase tracking-[0.18em] text-muted-foreground">{best.network} · {best.protocol}</p>
          <div className="mt-8 flex flex-wrap items-end gap-8"><div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Opportunity Score</p><p className="mt-1 font-mono text-5xl font-semibold text-emerald-300">{best.opportunityScore ?? '—'}</p></div><div><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Radar signal</p><p className="mt-2 text-xl tracking-[0.25em] text-primary">★★★★★</p></div></div>
          <div className="mt-8 grid gap-2 sm:grid-cols-2">{reasons.map((reason) => <div key={reason} className="flex items-start gap-2 text-xs text-foreground/80"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />{reason}</div>)}</div>
          <Link href={`/lp/opportunities/${best.poolAddress}`} className="mt-7 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">Abrir detalhes da pool <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/55 p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Capital novo</p><h2 className="mt-2 text-xl font-semibold tracking-tight">Onde o radar apontaria</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">Sem calcular alocação. Todos os cenários exibem somente a melhor oportunidade existente.</p>
          <div className="mt-5 grid grid-cols-2 gap-2">{[100, 500, 1000, 5000].map((amount) => <div key={amount} className="rounded-xl border border-border/60 bg-muted/20 p-4"><p className="font-mono text-lg font-semibold">US${amount.toLocaleString('en-US')}</p><div className="mt-3 flex items-center gap-2 text-xs text-primary"><Coins className="h-3.5 w-3.5" />{poolName(best)}</div></div>)}</div>
          <p className="mt-4 text-[10px] text-muted-foreground">Visualização informativa. Nenhuma ordem, alocação ou transação é produzida.</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/55">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Top 10 oportunidades</p><p className="mt-1 text-xs text-muted-foreground">Ranking do Opportunity Engine</p></div><Sparkles className="h-4 w-4 text-primary" /></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-muted/30 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><tr><th className="p-4">Rank</th><th className="p-4">Pool</th><th className="p-4">Chain</th><th className="p-4">Score</th><th className="p-4">APR</th><th className="p-4">TVL</th><th className="p-4">Status</th><th className="p-4">Ação</th></tr></thead><tbody>{top10.map((pool, index) => { const isCurrent = pool.poolAddress.toLowerCase() === currentAddress?.toLowerCase(); return <tr key={pool.poolAddress} className={`border-t border-border/50 ${isCurrent ? 'bg-primary/[.04]' : ''}`}><td className="p-4 font-mono">{index + 1}</td><td className="p-4"><p className="font-medium">{poolName(pool)}</p><p className="mt-1 font-mono text-[10px] text-muted-foreground">{pool.poolAddress.slice(0, 8)}…{pool.poolAddress.slice(-5)}</p></td><td className="p-4 capitalize">{pool.network}</td><td className="p-4 font-mono font-semibold">{pool.opportunityScore ?? '—'}</td><td className="p-4 font-mono">{pool.apr === null ? '—' : `${pool.apr.toFixed(2)}%`}</td><td className="p-4 font-mono">{money(pool.tvl)}</td><td className="p-4">{isCurrent ? <span className="text-primary">MINHA POOL</span> : 'Monitorada'}</td><td className="p-4"><Link href={`/lp/opportunities/${pool.poolAddress}`} className="text-primary">Detalhes</Link></td></tr>; })}</tbody></table></div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card/55 p-5"><div className="flex items-center gap-2"><WalletCards className="h-4 w-4 text-primary" /><h2 className="font-semibold">Comparação com minha pool</h2></div>{current ? <div className="mt-4"><div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><div className="flex justify-between"><div><p className="text-sm font-medium">{poolName(current)}</p><p className="mt-1 text-[10px] text-muted-foreground">Minha posição · ranking #{currentRank}</p></div><span className="font-mono text-xl font-semibold">{current.opportunityScore ?? '—'}</span></div></div><div className="mt-3 space-y-2">{top5.map((pool, index) => <div key={pool.poolAddress} className="flex items-center justify-between rounded-xl border border-border/60 p-3"><div><p className="text-sm font-medium">{index + 1}. {poolName(pool)}</p><p className="mt-1 text-[10px] text-muted-foreground">Score fornecido pelo Core</p></div><span className="font-mono text-sm">{pool.opportunityScore ?? '—'}</span></div>)}</div><p className="mt-3 text-[10px] text-muted-foreground">Diferenças numéricas não são calculadas pela interface.</p></div> : <p className="mt-4 text-sm text-muted-foreground">Pool atual ausente no ranking disponível.</p>}</div>
        <div className="rounded-2xl border border-border/70 bg-card/55 p-5"><div className="flex items-center gap-2"><Gauge className="h-4 w-4 text-primary" /><h2 className="font-semibold">Por que essa pool lidera?</h2></div><div className="mt-4 space-y-3">{reasons.map((reason) => <div key={reason} className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/15 p-3"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><p className="text-sm">{reason}</p></div>)}</div><p className="mt-4 text-[10px] text-muted-foreground">Textos explicam valores já fornecidos pelos módulos, sem exibir ou alterar fórmulas.</p></div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/55 p-5"><div className="flex items-center gap-2"><Radar className="h-4 w-4 text-primary" /><h2 className="font-semibold">Radar de narrativas</h2></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{narratives.map(([name, regime]) => { const state = regimeLabel(regime); const classes = toneClasses[state.tone as keyof typeof toneClasses].split(' '); return <div key={name} className="rounded-xl border border-border/60 p-4"><div className="flex items-center justify-between"><p className="text-sm font-medium">{name}</p><span className={`h-2 w-2 rounded-full ${classes[0]}`} /></div><p className={`mt-3 text-lg font-semibold ${classes[1]}`}>{state.label}</p><p className="mt-1 text-[10px] text-muted-foreground">Motor: {regime?.state ?? 'indisponível'} · {regime?.confidence ?? 0}%</p></div>; })}</div></section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card/55 p-5"><div className="flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /><h2 className="font-semibold">Alertas do radar</h2></div><div className="mt-4 space-y-2">{alertItems.map((item) => <div key={item} className="flex items-start gap-3 rounded-xl border border-border/60 p-3"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><p className="text-sm">{item}</p></div>)}</div><p className="mt-3 text-[10px] text-muted-foreground">Eventos de entrada/saída do Top 10 exigem ranking histórico persistido; quando ausente, não são inventados.</p></div>
        <div className="rounded-2xl border border-border/70 bg-card/55 p-5"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><h2 className="font-semibold">Evolução disponível</h2></div><div className="mt-4 grid grid-cols-3 gap-2">{windows.map((window) => <div key={window.label} className="rounded-xl border border-border/60 p-3"><p className="text-xs font-semibold">{window.label}</p><div className="mt-3 space-y-2 text-[10px] text-muted-foreground"><div><span>Score</span><p className="mt-1 font-mono text-sm text-foreground">{window.scores[0]?.opportunityScore ?? '—'}</p></div><div><span>LP Alpha</span><p className="mt-1 font-mono text-sm text-foreground">{window.alpha[0]?.lpAlphaPct ?? '—'}</p></div><div><span>Ranking</span><p className="mt-1 font-mono text-sm text-foreground">não persistido</p></div></div></div>)}</div><p className="mt-3 text-[10px] text-muted-foreground">Exibe a última leitura bruta encontrada em cada janela; não calcula variações.</p></div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/55 p-6"><div className="flex items-center gap-2"><Database className="h-4 w-4 text-primary" /><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Explicação da decisão</p></div><div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm text-muted-foreground">Sistema indica</p><p className="mt-1 text-3xl font-semibold tracking-tight">{report.status.status}</p></div><div className="max-w-2xl rounded-xl border border-border/60 bg-muted/15 p-4"><p className="text-sm leading-6">{report.status.status_reason}</p><p className="mt-2 text-xs text-muted-foreground">Confiança: {report.risk.confidence}% · Risco: {report.risk.overall_risk}</p></div></div></section>
    </div>
  );
}
