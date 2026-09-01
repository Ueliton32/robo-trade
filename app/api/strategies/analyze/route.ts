export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { generateSignals, saveNewSignals, notifySubscribedUsers, notifySignalOutcomes, buildPairStrategyPlan } from '@/lib/analysis-engine';
import { closeTriggeredSignals, checkTarget2Progress, recalculateStrategyStats } from '@/lib/stats-engine';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    const userId = (session.user as any)?.id;
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    const pairStrategyPlan = buildPairStrategyPlan(settings as any);

    const newSignals = await generateSignals(pairStrategyPlan);
    const saved = await saveNewSignals(newSignals);
    await notifySubscribedUsers(saved);

    // Checa sinais reais pendentes contra o histórico de candles da Binance:
    // fecha os que já bateram no alvo (WIN) ou no stop (LOSS), e expira os
    // muito antigos. Depois recalcula as estatísticas a partir de resultados
    // reais — nunca a partir de números fixos.
    const { closed, expired, closedSignals } = await closeTriggeredSignals();
    const target2Signals = await checkTarget2Progress();
    await notifySignalOutcomes(closedSignals, target2Signals);
    await recalculateStrategyStats();

    return NextResponse.json({
      analyzed: newSignals.length,
      saved: saved.length,
      signals: saved,
      closed,
      expired,
    });
  } catch (error: any) {
    console.error('Analysis error:', error);
    return NextResponse.json({ error: 'Erro na an\u00e1lise' }, { status: 500 });
  }
}
