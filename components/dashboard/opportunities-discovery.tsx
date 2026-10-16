'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, BarChart3, ChevronDown, Clock3, Search, SlidersHorizontal, Sparkles, Star } from 'lucide-react';
import { OpportunityPool } from '@/lib/dashboard/opportunities-server';

const stablecoins = new Set(['USDG', 'USDC', 'USDT', 'DAI', 'USDS', 'USD1']);
const btc = new Set(['BTC', 'WBTC', 'CBBTC', 'TBTC']);
const eth = new Set(['ETH', 'WETH', 'STETH', 'WSTETH', 'CBETH']);
const tokenizedStocks = new Set(['NVDA', 'SPY', 'QQQ', 'TSLA', 'AAPL', 'AMZN', 'MSFT', 'META', 'CRCL', 'SPCX']);
const rwa = new Set(['GLD', 'USO', 'XAU', 'XAG', 'BUIDL', 'ONDO']);
const ai = new Set(['AI', 'TAO', 'FET', 'RENDER', 'RNDR', 'NEAR', 'WLD']);

function categoryFor(pool: OpportunityPool) {
  const symbols = [pool.token0Symbol.toUpperCase(), pool.token1Symbol.toUpperCase()];
  if (symbols.some((symbol) => btc.has(symbol))) return 'BTC';
  if (symbols.some((symbol) => eth.has(symbol))) return 'ETH';
  if (symbols.every((symbol) => stablecoins.has(symbol))) return 'Stablecoins';
  if (symbols.some((symbol) => tokenizedStocks.has(symbol))) return 'Tokenized Stocks';
  if (symbols.some((symbol) => rwa.has(symbol))) return 'RWA';
  if (symbols.some((symbol) => ai.has(symbol))) return 'IA';
  if (symbols.some((symbol) => stablecoins.has(symbol))) return 'Stablecoin Pair';
  return 'Outros';
}

function compactMoney(value: number | null) {
  if (value === null) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', style: 'currency', currency: 'USD', maximumFractionDigits: 1 }).format(value);
}

function percent(value: number | null) {
  return value === null ? '—' : `${value.toFixed(2)}%`;
}

function poolName(pool: OpportunityPool) {
  return `${pool.token0Symbol} / ${pool.token1Symbol}`;
}

type SortKey = 'score' | 'apr' | 'tvl' | 'volume' | 'liquidity';
type SortDirection = 'desc' | 'asc';

function sortValue(pool: OpportunityPool, key: SortKey) {
  if (key === 'score') return pool.opportunityScore;
  if (key === 'apr') return pool.apr;
  if (key === 'tvl') return pool.tvl;
  if (key === 'volume') return pool.volume24h;
  return pool.liquidity ?? pool.liquidityScore;
}

export function OpportunitiesDiscovery({ pools, networks, protocols, currentPoolAddress, marketLabel }: { pools: OpportunityPool[]; networks: string[]; protocols: string[]; currentPoolAddress: string | null; marketLabel: string }) {
  const [search, setSearch] = useState('');
  const [network, setNetwork] = useState('all');
  const [protocol, setProtocol] = useState('all');
  const [category, setCategory] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const saved = window.localStorage.getItem('lp-opportunity-watchlist');
    if (saved) setFavorites(JSON.parse(saved));
  }, []);

  const toggleFavorite = (address: string) => {
    setFavorites((current) => {
      const next = current.includes(address) ? current.filter((item) => item !== address) : [...current, address];
      window.localStorage.setItem('lp-opportunity-watchlist', JSON.stringify(next));
      return next;
    });
  };

  const categories = useMemo(() => [...new Set(pools.map(categoryFor))].sort(), [pools]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pools.filter((pool) => {
      const matchesSearch = !query || poolName(pool).toLowerCase().includes(query) || pool.poolAddress.toLowerCase().includes(query) || pool.token0Address.toLowerCase().includes(query) || pool.token1Address.toLowerCase().includes(query);
      return matchesSearch && (network === 'all' || pool.network === network) && (protocol === 'all' || pool.protocol === protocol) && (category === 'all' || categoryFor(pool) === category);
    }).sort((a, b) => {
      const left = sortValue(a, sortKey);
      const right = sortValue(b, sortKey);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return sortDirection === 'desc' ? right - left : left - right;
    });
  }, [pools, search, network, protocol, category, sortKey, sortDirection]);

  const currentPool = pools.find((pool) => pool.poolAddress.toLowerCase() === currentPoolAddress?.toLowerCase());
  const topPools = pools.filter((pool) => pool.opportunityScore !== null).slice(0, 3);
  const newest = [...pools].sort((a, b) => (b.firstSeenMs ?? 0) - (a.firstSeenMs ?? 0)).slice(0, 5);
  const movers = pools.filter((pool) => pool.priceChange24h !== null).sort((a, b) => (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0)).slice(0, 5);
  const watchlist = pools.filter((pool) => favorites.includes(pool.poolAddress));

  const changeSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection((direction) => direction === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDirection('desc'); }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl border border-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/.12),transparent_38%),hsl(var(--card)/.55)] p-6">
          <div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Top opportunities</p><span className="rounded-lg border border-border/60 bg-black/10 px-2 py-1 text-[10px] text-muted-foreground">{marketLabel}</span></div>
          <div className="mt-5 space-y-2">
            {topPools.map((pool, index) => <Link href={`/lp/opportunities/${pool.poolAddress}`} key={pool.poolAddress} className="grid grid-cols-[34px_1fr_auto] items-center gap-3 rounded-xl border border-border/60 bg-black/10 p-3 transition-colors hover:border-primary/30 hover:bg-primary/[.04]"><span className="font-mono text-sm text-muted-foreground">0{index + 1}</span><div><p className="text-sm font-medium">{poolName(pool)}</p><p className="mt-1 text-[10px] text-muted-foreground">{categoryFor(pool)} · {pool.network}</p></div><div className="text-right"><p className="font-mono text-lg font-semibold">{pool.opportunityScore ?? '—'}</p><p className="text-[10px] text-muted-foreground">score</p></div></Link>)}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/55 p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Minha pool vs líderes</p>
          {currentPool ? <div className="mt-5"><div className="flex items-start justify-between"><div><p className="text-lg font-semibold">{poolName(currentPool)}</p><p className="mt-1 text-xs text-muted-foreground">Pool atual</p></div><span className="rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 font-mono text-sm text-primary">{currentPool.opportunityScore ?? '—'}</span></div><div className="mt-5 space-y-3">{topPools.slice(0, 2).map((pool) => <div key={pool.poolAddress} className="flex items-center justify-between border-t border-border/60 pt-3 text-xs"><span className="text-muted-foreground">vs {poolName(pool)}</span><span className="font-mono">{pool.opportunityScore ?? '—'}</span></div>)}</div><Link href={`/lp/opportunities/${currentPool.poolAddress}`} className="mt-5 flex items-center gap-1 text-xs font-medium text-primary">Ver comparação detalhada <ArrowRight className="h-3.5 w-3.5" /></Link></div> : <p className="mt-5 text-sm text-muted-foreground">A pool atual não aparece no snapshot de oportunidades disponível.</p>}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/55 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_repeat(4,170px)]">
          <label className="flex h-11 items-center gap-2 rounded-xl border border-border/70 bg-background/30 px-3"><Search className="h-4 w-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar token, pool ou endereço" className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></label>
          <label className="relative"><span className="sr-only">Chain</span><select value={network} onChange={(event) => setNetwork(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-border/70 bg-background/30 px-3 pr-8 text-sm outline-none"><option value="all">Chain: Todas</option>{networks.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" /></label>
          <label className="relative"><span className="sr-only">Protocolo</span><select value={protocol} onChange={(event) => setProtocol(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-border/70 bg-background/30 px-3 pr-8 text-sm outline-none"><option value="all">Protocolo: Todos</option>{protocols.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" /></label>
          <label className="relative"><span className="sr-only">Categoria</span><select value={category} onChange={(event) => setCategory(event.target.value)} className="h-11 w-full appearance-none rounded-xl border border-border/70 bg-background/30 px-3 pr-8 text-sm outline-none"><option value="all">Categoria: Todas</option>{categories.map((option) => <option key={option} value={option}>{option}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" /></label>
          <label className="relative"><select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} className="h-11 w-full appearance-none rounded-xl border border-border/70 bg-background/30 px-3 pr-8 text-sm outline-none"><option value="score">Ordenar: Score</option><option value="apr">Ordenar: APR</option><option value="tvl">Ordenar: TVL</option><option value="volume">Ordenar: Volume</option><option value="liquidity">Ordenar: Liquidez</option></select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" /></label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card/55">
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ranking completo</p><p className="mt-1 text-xs text-muted-foreground">{filtered.length} pools encontradas</p></div><SlidersHorizontal className="h-4 w-4 text-muted-foreground" /></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-xs"><thead className="bg-muted/30 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"><tr><th className="p-4">#</th><th className="p-4">Pool</th><th className="p-4">Categoria</th>{[['score','Score'],['apr','APR'],['tvl','TVL'],['volume','Volume 24h'],['liquidity','Liquidez']].map(([key,label]) => <th key={key} className="p-4"><button onClick={() => changeSort(key as SortKey)} className="flex items-center gap-1">{label}{sortKey === key && (sortDirection === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}</button></th>)}<th className="p-4">Chain</th><th className="p-4">Watch</th></tr></thead><tbody>{filtered.map((pool, index) => { const current = pool.poolAddress.toLowerCase() === currentPoolAddress?.toLowerCase(); const favorite = favorites.includes(pool.poolAddress); return <tr key={pool.poolAddress} className={`border-t border-border/50 transition-colors hover:bg-muted/25 ${current ? 'bg-primary/[.035]' : ''}`}><td className="p-4 font-mono text-muted-foreground">{index + 1}</td><td className="p-4"><Link href={`/lp/opportunities/${pool.poolAddress}`} className="font-medium hover:text-primary">{poolName(pool)}</Link><p className="mt-1 font-mono text-[10px] text-muted-foreground">{pool.poolAddress.slice(0, 8)}…{pool.poolAddress.slice(-6)} {current && '· SUA POOL'}</p></td><td className="p-4"><span className="rounded-md bg-muted/50 px-2 py-1 text-[10px]">{categoryFor(pool)}</span></td><td className="p-4 font-mono font-semibold">{pool.opportunityScore ?? '—'}</td><td className="p-4 font-mono">{percent(pool.apr)}</td><td className="p-4 font-mono">{compactMoney(pool.tvl)}</td><td className="p-4 font-mono">{compactMoney(pool.volume24h)}</td><td className="p-4 font-mono">{pool.liquidity !== null ? compactMoney(pool.liquidity) : pool.liquidityScore ?? '—'}</td><td className="p-4 capitalize">{pool.network}</td><td className="p-4"><button onClick={() => toggleFavorite(pool.poolAddress)} aria-label="Favoritar pool" className={`grid h-8 w-8 place-items-center rounded-lg border ${favorite ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border/60 text-muted-foreground hover:text-foreground'}`}><Star className={`h-3.5 w-3.5 ${favorite ? 'fill-current' : ''}`} /></button></td></tr>; })}</tbody></table></div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card/55 p-5"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /><h2 className="font-semibold">Novas pools</h2></div><div className="mt-4 space-y-2">{newest.map((pool) => <Link href={`/lp/opportunities/${pool.poolAddress}`} key={pool.poolAddress} className="flex items-center justify-between rounded-xl border border-border/60 p-3 hover:bg-muted/25"><div><p className="text-sm font-medium">{poolName(pool)}</p><p className="mt-1 text-[10px] text-muted-foreground">{pool.firstSeenMs ? new Date(pool.firstSeenMs).toLocaleString('pt-BR') : 'Data indisponível'}</p></div><span className="font-mono text-sm">{pool.opportunityScore ?? '—'}</span></Link>)}</div></div>
        <div className="rounded-2xl border border-border/70 bg-card/55 p-5"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" /><h2 className="font-semibold">Maior crescimento disponível</h2></div>{movers.length ? <div className="mt-4 space-y-2">{movers.map((pool) => <Link href={`/lp/opportunities/${pool.poolAddress}`} key={pool.poolAddress} className="flex items-center justify-between rounded-xl border border-border/60 p-3"><span className="text-sm font-medium">{poolName(pool)}</span><span className="font-mono text-sm text-emerald-300">{percent(pool.priceChange24h)}</span></Link>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground"><p>O Pool Scanner atual não produziu variação de TVL ou volume.</p><p className="mt-2 text-xs">A interface não calcula crescimento por conta própria para preservar as métricas do Core.</p></div>}</div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card/55 p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Watchlist</p><h2 className="mt-2 font-semibold">Pools favoritas</h2></div><Star className="h-4 w-4 text-primary" /></div>{watchlist.length ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{watchlist.map((pool) => <Link href={`/lp/opportunities/${pool.poolAddress}`} key={pool.poolAddress} className="rounded-xl border border-border/60 p-4 hover:border-primary/30"><div className="flex justify-between"><p className="text-sm font-medium">{poolName(pool)}</p><span className="font-mono text-sm">{pool.opportunityScore ?? '—'}</span></div><p className="mt-2 text-[10px] text-muted-foreground">{categoryFor(pool)} · {pool.network}</p></Link>)}</div> : <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground"><Clock3 className="h-4 w-4" /> Marque uma estrela no ranking para montar sua watchlist local.</div>}</section>
    </div>
  );
}
