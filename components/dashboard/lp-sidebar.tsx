'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, Compass, Gauge, Home, Layers3, LineChart, PanelLeftClose, PanelLeftOpen, Radar, Settings2, WalletCards } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/lp', label: 'Home', sub: 'Resumo executivo', icon: Home },
  { href: '/lp/radar', label: 'Radar', sub: 'Alpha do dia', icon: Radar },
  { href: '/lp/portfolio', label: 'Portfolio', sub: 'Sua posição', icon: WalletCards },
  { href: '/lp/opportunities', label: 'Opportunities', sub: 'Ranking de pools', icon: Compass },
  { href: '/lp/market', label: 'Market', sub: 'Regimes atuais', icon: LineChart },
  { href: '/lp/decision', label: 'Decision', sub: 'Regras e motivos', icon: Gauge },
  { href: '/lp/snapshots', label: 'Snapshots', sub: 'Histórico', icon: Layers3 },
  { href: '/lp/analytics', label: 'Analytics', sub: 'Visão técnica', icon: BarChart3 },
  { href: '/lp/settings', label: 'Settings', sub: 'Saúde do sistema', icon: Settings2 },
];

export function LpSidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen((value) => !value)} className="fixed left-4 top-4 z-50 grid h-10 w-10 place-items-center rounded-xl border border-border bg-card shadow-lg lg:hidden" aria-label="Abrir menu">
        {open ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
      </button>
      {open && <button aria-label="Fechar menu" className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn('fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-border/70 bg-[hsl(222_40%_7%/.96)] px-4 py-5 backdrop-blur-xl transition-transform lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_30px_hsl(var(--primary)/.18)]"><Activity className="h-5 w-5" /></div>
          <div><p className="font-semibold tracking-tight">LP Intelligence</p><p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Decision terminal</p></div>
        </div>

        <div className="mt-8 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Workspace</div>
        <nav className="mt-3 space-y-1">
          {items.map(({ href, label, sub, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link key={href} href={href} onClick={() => setOpen(false)} className={cn('group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors', active ? 'bg-primary/12 text-foreground ring-1 ring-primary/20' : 'text-muted-foreground hover:bg-muted/45 hover:text-foreground')}>
                <Icon className={cn('h-4 w-4 shrink-0', active && 'text-primary')} />
                <div className="min-w-0"><p className="text-sm font-medium leading-4">{label}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{sub}</p></div>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-xl border border-emerald-400/15 bg-emerald-400/5 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" /> Core online</div>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Interface read-only. Nenhuma transação ou alteração de parâmetros.</p>
        </div>
      </aside>
    </>
  );
}
