'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#f0b90b', '#22c55e', '#ef4444', '#3b82f6', '#a855f7', '#f97316'];

export default function StatsCharts({ stats, signals }: { stats: any[]; signals: any[] }) {
  const barData = (stats ?? []).map((s: any) => ({
    name: (s?.strategyName ?? '').length > 15 ? (s?.strategyName ?? '').substring(0, 15) + '...' : (s?.strategyName ?? ''),
    winRate: s?.winRate ?? 0,
    profitFactor: s?.profitFactor ?? 0,
  }));

  const pieData = (stats ?? []).map((s: any) => ({
    name: s?.strategyName ?? '',
    value: s?.totalTrades ?? 0,
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-card/80 rounded-lg border border-border/50 p-4">
        <h3 className="text-sm font-display text-muted-foreground mb-4">Win Rate por Estratégia</h3>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} margin={{ top: 5, right: 10, left: 0, bottom: 40 }}>
              <XAxis dataKey="name" tickLine={false} tick={{ fontSize: 10 }} angle={-30} textAnchor="end" />
              <YAxis tickLine={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#1a1f2e', border: '1px solid #2a2f3e', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="winRate" fill="#f0b90b" radius={[4, 4, 0, 0]} name="Win Rate %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-card/80 rounded-lg border border-border/50 p-4">
        <h3 className="text-sm font-display text-muted-foreground mb-4">Distribuição de Trades</h3>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2} label={({ name, percent }: any) => `${(name ?? '').substring(0, 10)} ${((percent ?? 0) * 100)?.toFixed?.(0)}%`} labelLine={false}>
                {(pieData ?? []).map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1a1f2e', border: '1px solid #2a2f3e', borderRadius: 8, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
