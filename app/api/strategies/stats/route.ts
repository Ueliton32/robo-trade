export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { STRATEGY_DEFS } from '@/lib/strategies';
import { STRATEGY_DESCRIPTIONS } from '@/lib/stats-engine';
import { computeMetrics, TradeLike } from '@/lib/metrics';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const since = searchParams.get('since'); // data ISO opcional

    // Sem filtro: comportamento de sempre, lê a tabela pré-calculada
    // (histórico completo desde que a estratégia começou a rodar).
    if (!since) {
      const stats = await prisma.strategyStats.findMany({ orderBy: { strategyId: 'asc' } });
      return NextResponse.json({ stats, filtered: false });
    }

    const sinceDate = new Date(since);
    if (isNaN(sinceDate.getTime())) {
      return NextResponse.json({ error: 'Data inv\u00e1lida' }, { status: 400 });
    }

    // Com filtro: recalcula na hora, olhando só sinais criados a partir da
    // data escolhida — útil pra ver o desempenho depois de uma mudança de
    // configuração, sem o histórico antigo (de outra config) diluindo o
    // número.
    const stats = [];
    for (const strat of STRATEGY_DEFS) {
      const closedSignals = await prisma.signal.findMany({
        where: {
          strategyId: strat.id,
          source: 'live',
          status: { in: ['WIN', 'LOSS'] },
          createdAt: { gte: sinceDate },
        },
        orderBy: { closedAt: 'asc' },
      });
      const metrics = computeMetrics(closedSignals as TradeLike[]);
      stats.push({
        strategyId: strat.id,
        strategyName: strat.name,
        description: STRATEGY_DESCRIPTIONS[strat.id] ?? '',
        ...metrics,
      });
    }

    return NextResponse.json({ stats, filtered: true, since: sinceDate.toISOString() });
  } catch (error: any) {
    console.error('Stats error:', error);
    return NextResponse.json({ stats: [], error: 'Erro ao buscar estat\u00edsticas' }, { status: 500 });
  }
}
