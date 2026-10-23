'use client';

import { ArrowUpRight, Database, Droplets, Gauge, Landmark, LineChart, Sparkles } from 'lucide-react';
import { DecisionReport, MarketRegime } from '@/types/dashboard';

const regimeInfo = [
  { key: 'crypto_regime', label: 'Crypto', icon: LineChart },
  { key: 'macro_regime', label: 'Macro', icon: Landmark },
  { key: 'liquidity_regime', label: 'Liquidez', icon: Droplets },
  { key: 'tokenization_regime', label: 'Tokenização', icon: Sparkles },
  { key: 'market_regime', label: 'Mercado', icon: Gauge },
] as const;

function stateCopy(regime: MarketRegime | null, label: string) {
  if (!regime) return { title: 'Sem dados', copy: 'Aguardando o próximo snapshot.', tone: 'slate' };
  const state = regime.state.toUpperCase();
  if (state === 'BULLISH') return { title: label === 'Crypto' ? 'Risk on' : 'Favorável', copy: 'Condições positivas no snapshot atual.', tone: 'emerald' };
  if (state === 'BEARISH') return { title: label === 'Crypto' ? 'Risk off' : 'Desfavorável', copy: 'Ambiente pede cautela adicional.', tone: 'rose' };
  if (state === 'VOLATILE') return { title: 'Volátil', copy: 'Oscilações elevadas exigem atenção.', tone: 'amber' };
  if (state === 'SIDEWAYS') return { title: 'Lateral', copy: 'Sem direção predominante no momento.', tone: 'amber' };
  return { title: 'Neutro', copy: regime.confidence === 0 ? 'Fonte sem confiança suficiente agora.' : 'Sem viés forte no snapshot atual.', tone: 'slate' };
}

const tone = {
  emerald: 'bg-emerald-400 text-emerald-300',
  amber: 'bg-amber-400 text-amber-300',
  rose: 'bg-rose-400 text-rose-300',
  slate: 'bg-slate-400 text-slate-300',
};

export function MarketNow({ report }: { report: DecisionReport }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card/55 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Mercado agora</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">Leitura em linguagem simples</h2>
        </div>
        <Database className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="mt-5 divide-y divide-border/60">
        {regimeInfo.map(({ key, label, icon: Icon }) => {
          const regime = report.market_context[key];
          const info = stateCopy(regime, label);
          return (
            <div key={key} className="grid gap-2 py-3.5 sm:grid-cols-[130px_110px_1fr_auto] sm:items-center">
              <div className="flex items-center gap-2 text-sm font-medium"><Icon className="h-4 w-4 text-muted-foreground" />{label}</div>
              <div className={`flex items-center gap-2 text-xs font-semibold ${tone[info.tone as keyof typeof tone].split(' ')[1]}`}>
                <span className={`h-2 w-2 rounded-full ${tone[info.tone as keyof typeof tone].split(' ')[0]}`} />{info.title}
              </div>
              <p className="text-xs text-muted-foreground">{info.copy}</p>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">{regime?.confidence ?? 0}% <ArrowUpRight className="h-3 w-3" /></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
