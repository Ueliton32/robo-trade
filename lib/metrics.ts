// Cálculo de métricas de performance (win rate, payoff, profit factor,
// drawdown, expectativa) — usado tanto pelas Estatísticas reais
// (lib/stats-engine.ts) quanto pelo backtest histórico (lib/backtest-engine.ts),
// pra garantir que os dois calculam do MESMO jeito e são comparáveis.

export interface TradeLike {
  pair: string;
  timeframe: string;
  status: string; // 'WIN' | 'LOSS'
  pnlPercent: number | null;
  createdAt: Date;
  closedAt: Date | null;
}

export interface ComputedMetrics {
  winRate: number;
  payoff: number;
  profitFactor: number;
  maxDrawdown: number;
  expectancy: number;
  bestAssets: string[];
  bestHours: string[];
  bestTimeframes: string[];
  totalTrades: number;
  wins: number;
  losses: number;
}

const MIN_SAMPLE_FOR_BREAKDOWN = 3;

export function computeMetrics(trades: TradeLike[]): ComputedMetrics {
  const totalTrades = trades.length;

  if (totalTrades === 0) {
    return {
      winRate: 0,
      payoff: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      expectancy: 0,
      bestAssets: [],
      bestHours: [],
      bestTimeframes: [],
      totalTrades: 0,
      wins: 0,
      losses: 0,
    };
  }

  const wins = trades.filter((s) => s.status === 'WIN');
  const losses = trades.filter((s) => s.status === 'LOSS');
  const pnls = trades.map((s) => s.pnlPercent ?? 0);

  const winRate = (wins.length / totalTrades) * 100;

  const avgWin = wins.length ? avg(wins.map((s) => s.pnlPercent ?? 0)) : 0;
  const avgLossAbs = losses.length ? Math.abs(avg(losses.map((s) => s.pnlPercent ?? 0))) : 0;
  const payoff = avgLossAbs > 0 ? avgWin / avgLossAbs : avgWin > 0 ? avgWin : 0;

  const grossProfit = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const grossLossAbs = Math.abs(pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0));
  const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : grossProfit > 0 ? grossProfit : 0;

  const expectancy = avg(pnls);
  const maxDrawdown = computeMaxDrawdown(pnls);

  const bestAssets = topByWinRate(trades, (s) => s.pair);
  const bestTimeframes = topByWinRate(trades, (s) => s.timeframe);
  const bestHours = topHourBuckets(trades);

  return {
    winRate,
    payoff,
    profitFactor,
    maxDrawdown,
    expectancy,
    bestAssets,
    bestHours,
    bestTimeframes,
    totalTrades,
    wins: wins.length,
    losses: losses.length,
  };
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// Máximo drawdown de uma curva de patrimônio simples (soma sequencial dos % de PnL,
// sem compor). Suficiente para dar uma ideia de risco, não é contabilidade exata.
function computeMaxDrawdown(pnls: number[]): number {
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  for (const p of pnls) {
    equity += p;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function topByWinRate(trades: TradeLike[], keyFn: (s: TradeLike) => string, top = 3): string[] {
  const groups = new Map<string, { wins: number; total: number }>();
  for (const s of trades) {
    const key = keyFn(s);
    const g = groups.get(key) ?? { wins: 0, total: 0 };
    g.total++;
    if (s.status === 'WIN') g.wins++;
    groups.set(key, g);
  }
  return Array.from(groups.entries())
    .filter(([, g]) => g.total >= MIN_SAMPLE_FOR_BREAKDOWN)
    .sort((a, b) => b[1].wins / b[1].total - a[1].wins / a[1].total)
    .slice(0, top)
    .map(([key]) => key);
}

function topHourBuckets(trades: TradeLike[], top = 3): string[] {
  const groups = new Map<number, { wins: number; total: number }>();
  for (const s of trades) {
    const hour = new Date(s.createdAt).getUTCHours();
    const bucket = Math.floor(hour / 2) * 2; // blocos de 2h em UTC
    const g = groups.get(bucket) ?? { wins: 0, total: 0 };
    g.total++;
    if (s.status === 'WIN') g.wins++;
    groups.set(bucket, g);
  }
  return Array.from(groups.entries())
    .filter(([, g]) => g.total >= MIN_SAMPLE_FOR_BREAKDOWN)
    .sort((a, b) => b[1].wins / b[1].total - a[1].wins / a[1].total)
    .slice(0, top)
    .map(([bucket]) => `${String(bucket).padStart(2, '0')}:00-${String((bucket + 2) % 24).padStart(2, '0')}:00 UTC`);
}
