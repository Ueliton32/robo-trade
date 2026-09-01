export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { buildPairStrategyPlan } from '@/lib/analysis-engine';
import { checkAllDivergences, getPausedComboKeys } from '@/lib/divergence-check';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const days = Math.max(1, parseInt(searchParams.get('days') ?? '7', 10) || 7);

    const userId = (session.user as any)?.id;
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    const plan = buildPairStrategyPlan(settings as any);

    const results = await checkAllDivergences(plan, days);
    const pausedCombos = await getPausedComboKeys();

    // Mant\u00e9m o formato que a tela j\u00e1 espera (n\u00e3o quebra a UI existente).
    // "paused" \u00e9 novo: true quando o rob\u00f4 j\u00e1 parou de gerar sinal novo pra
    // essa combina\u00e7\u00e3o por diverg\u00eancia persistente (lib/divergence-check.ts).
    const comparisons = results.map((r) => ({
      pair: r.pair,
      strategyId: r.strategyId,
      strategyName: r.strategyName,
      timeframe: r.timeframe,
      backtest: r.backtestPF !== null ? { profitFactor: r.backtestPF } : null,
      live: { totalTrades: r.liveTotalTrades, profitFactor: r.livePF, expectancy: r.liveExpectancy },
      hasEnoughLiveData: r.hasEnoughLiveData,
      divergent: r.divergent,
      usedAbsoluteFallback: r.usedAbsoluteFallback,
      paused: pausedCombos.has(`${r.strategyId}|${r.pair}|${r.timeframe}`),
    }));

    return NextResponse.json({ comparisons, days });
  } catch (error: any) {
    console.error('Live comparison error:', error);
    return NextResponse.json({ error: 'Erro ao comparar backtest com dados reais', comparisons: [] }, { status: 500 });
  }
}
