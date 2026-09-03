'use client';
import { useEffect, useState, useCallback } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ShieldCheck, RefreshCw, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const CRITERIA_LABELS: Record<string, string> = {
  uptimeScore: 'Uptime (14d)',
  sampleScore: 'Amostra ao vivo',
  strategyStabilityScore: 'Estratégia estável',
  stabilityScanScore: 'Stability-scans',
  divergenceControlScore: 'Sem divergência nova',
};

function bandColor(total: number): string {
  if (total >= 70) return '#22c55e';
  if (total >= 40) return '#f0b90b';
  return '#ef4444';
}

export default function ReliabilityGauge() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pilot/reliability');
      const json = await res.json();
      if (res.ok) setData(json);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = data?.current?.total ?? null;
  const breakdown = data?.current?.breakdown ?? {};
  const color = total !== null ? bandColor(total) : '#6b7280';
  const chartData = (data?.history ?? []).map((h: any) => ({
    date: new Date(h.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    total: h.total,
  }));

  return (
    <Card className="bg-card/80 border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-display flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> Índice de Confiabilidade do Robô
          </CardTitle>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-2 bg-muted/30 rounded-lg p-3 mb-4 text-xs text-muted-foreground">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Mede maturidade <b className="text-foreground">técnica e operacional</b> (uptime, amostra, estabilidade das decisões) —
            <b className="text-foreground"> nunca é recomendação de investimento</b>. Pode cair, não só subir: uma pausa recente ou
            divergência nova reduz a pontuação até o sistema provar estável de novo.
          </span>
        </div>

        {total === null ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <>
            <div className="flex items-center gap-6 mb-4">
              <div className="text-center">
                <div className="text-5xl font-bold font-mono" style={{ color }}>{total}</div>
                <div className="text-xs text-muted-foreground mt-1">de 100</div>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(CRITERIA_LABELS).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-mono font-medium">{breakdown[key] ?? 0}/20</span>
                  </div>
                ))}
              </div>
            </div>

            {chartData.length >= 2 ? (
              <div className="h-[140px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="reliabilityGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3e" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tickLine={false} tick={{ fontSize: 10 }} width={28} />
                    <Tooltip contentStyle={{ background: '#1a1f2e', border: '1px solid #2a2f3e', borderRadius: 8, fontSize: 11 }} />
                    <Area type="monotone" dataKey="total" stroke={color} strokeWidth={2} fill="url(#reliabilityGradient)" name="Índice" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Histórico ainda curto — a linha do tempo aparece aqui conforme os dias passam (1 registro por dia).
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
