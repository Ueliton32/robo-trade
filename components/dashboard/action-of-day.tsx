'use client';

import { ArrowRight, CheckCircle2, Eye, RotateCcw, ShieldAlert } from 'lucide-react';
import { DecisionReport } from '@/types/dashboard';

const actionMeta = {
  HEALTHY: { label: 'HOLD', tone: 'emerald', icon: CheckCircle2 },
  STRONG_CANDIDATE: { label: 'HOLD', tone: 'emerald', icon: CheckCircle2 },
  WATCH: { label: 'WATCH', tone: 'amber', icon: Eye },
  REVIEW: { label: 'REVIEW', tone: 'amber', icon: ShieldAlert },
  ROTATE_CANDIDATE: { label: 'ROTATE', tone: 'rose', icon: RotateCcw },
  UNHEALTHY: { label: 'ROTATE', tone: 'rose', icon: RotateCcw },
} as const;

const toneClasses = {
  emerald: {
    shell: 'border-emerald-400/25 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,.18),transparent_42%),linear-gradient(135deg,rgba(16,185,129,.08),rgba(15,23,42,.2))]',
    icon: 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/20',
    label: 'text-emerald-300',
    dot: 'bg-emerald-400',
  },
  amber: {
    shell: 'border-amber-400/25 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,.18),transparent_42%),linear-gradient(135deg,rgba(245,158,11,.08),rgba(15,23,42,.2))]',
    icon: 'bg-amber-400/15 text-amber-300 ring-amber-400/20',
    label: 'text-amber-300',
    dot: 'bg-amber-400',
  },
  rose: {
    shell: 'border-rose-400/25 bg-[radial-gradient(circle_at_top_left,rgba(244,63,94,.18),transparent_42%),linear-gradient(135deg,rgba(244,63,94,.08),rgba(15,23,42,.2))]',
    icon: 'bg-rose-400/15 text-rose-300 ring-rose-400/20',
    label: 'text-rose-300',
    dot: 'bg-rose-400',
  },
};

function humanReason(report: DecisionReport) {
  const status = report.status.status;
  const inRange = report.portfolio.current_position?.in_range;
  const alpha = report.portfolio.lp_alpha ?? report.portfolio.lp_alpha_pct ?? 0;

  if (status === 'UNHEALTHY' || status === 'ROTATE_CANDIDATE') {
    return 'A posição exige atenção. Revise os riscos e compare com as oportunidades disponíveis antes de decidir.';
  }
  if (status === 'REVIEW' || status === 'WATCH') {
    return `${inRange ? 'A posição segue dentro do range' : 'A posição está fora do range'}, mas existem pontos de atenção. ${alpha >= 0 ? 'O LP Alpha permanece positivo.' : 'O LP Alpha está negativo.'}`;
  }
  return `Sua posição permanece saudável. ${alpha >= 0 ? 'LP Alpha positivo.' : ''} Nenhuma ação necessária agora.`;
}

export function ActionOfDay({ report }: { report: DecisionReport }) {
  const meta = actionMeta[report.status.status];
  const tone = toneClasses[meta.tone];
  const Icon = meta.icon;

  return (
    <section className={`relative overflow-hidden rounded-2xl border p-6 sm:p-8 ${tone.shell}`}>
      <div className="relative z-10 grid gap-7 lg:grid-cols-[1.15fr_.85fr] lg:items-end">
        <div>
          <div className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
            Ação do dia
          </div>
          <div className="flex items-center gap-4">
            <div className={`grid h-14 w-14 place-items-center rounded-2xl ring-1 ${tone.icon}`}>
              <Icon className="h-7 w-7" />
            </div>
            <div>
              <p className={`text-4xl font-semibold tracking-[-0.04em] sm:text-5xl ${tone.label}`}>{meta.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">Confiança do sistema: <span className="font-medium text-foreground">{report.risk.confidence}%</span></p>
            </div>
          </div>
          <p className="mt-6 max-w-2xl text-base leading-7 text-foreground/85">{humanReason(report)}</p>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/15 p-4 backdrop-blur-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Motivo principal</p>
          <p className="mt-2 text-sm font-medium leading-6 text-foreground">{report.status.status_reason}</p>
          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-xs">
            <span className="text-muted-foreground">Risco atual</span>
            <span className="flex items-center gap-1.5 font-medium">
              {report.risk.overall_risk}
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
