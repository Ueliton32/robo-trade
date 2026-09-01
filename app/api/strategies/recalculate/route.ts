export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { closeTriggeredSignals, checkTarget2Progress, recalculateStrategyStats } from '@/lib/stats-engine';
import { notifySignalOutcomes } from '@/lib/analysis-engine';
import { prisma } from '@/lib/prisma';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    const { closed, expired, closedSignals } = await closeTriggeredSignals();
    const target2Signals = await checkTarget2Progress();
    await notifySignalOutcomes(closedSignals, target2Signals);
    await recalculateStrategyStats();
    const stats = await prisma.strategyStats.findMany({ orderBy: { strategyId: 'asc' } });

    return NextResponse.json({ closed, expired, stats });
  } catch (error: any) {
    console.error('Recalculate error:', error);
    return NextResponse.json({ error: 'Erro ao recalcular estat\u00edsticas' }, { status: 500 });
  }
}
