'use client';

import { AlertCircle, Bell, CheckCircle2 } from 'lucide-react';
import { DecisionReport } from '@/types/dashboard';

export function ExecutiveAlerts({ report }: { report: DecisionReport }) {
  const alerts = [
    ...report.status.watch_items,
    ...report.risk.primary_risks.filter((risk) => !report.status.watch_items.includes(risk)),
  ];

  return (
    <section className="rounded-2xl border border-border/70 bg-card/55 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Alertas</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight">O que merece atenção</h2>
        </div>
        <Bell className="h-4 w-4 text-muted-foreground" />
      </div>

      {alerts.length === 0 ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4">
          <CheckCircle2 className="h-5 w-5 text-emerald-300" />
          <div>
            <p className="text-sm font-medium">Nenhum alerta ativo</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Sua posição não exige atenção imediata.</p>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {alerts.map((alert, index) => (
            <div key={`${alert}-${index}`} className="flex items-start gap-3 rounded-xl border border-amber-400/15 bg-amber-400/5 p-3.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p className="text-sm text-foreground/85">{alert}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
