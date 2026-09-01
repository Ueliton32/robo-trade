export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { STRATEGY_DEFS } from '@/lib/strategies';
import { logPilotEvent } from '@/lib/pilot-log';

const VALID_STRATEGY_IDS = STRATEGY_DEFS.map((s) => s.id) as [number, ...number[]];

const bodySchema = z.object({
  strategyId: z.number().int().refine((id) => VALID_STRATEGY_IDS.includes(id), 'ID de estratégia inválido'),
  pair: z.string().min(1),
  timeframe: z.string().min(1),
});

// Pausa manual — mesmo efeito que o auto-pause por divergência persistente
// (lib/divergence-check.ts), mas disparado por alguém decidindo direto no
// dashboard, sem esperar 3 checagens diárias.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { strategyId, pair, timeframe } = parsed.data;

    await prisma.divergenceStreak.upsert({
      where: { strategyId_pair_timeframe: { strategyId, pair, timeframe } },
      update: { paused: true, pausedAt: new Date() },
      create: { strategyId, pair, timeframe, paused: true, pausedAt: new Date(), streak: 0 },
    });

    const strat = STRATEGY_DEFS.find((s) => s.id === strategyId);
    await logPilotEvent(
      'MANUAL_PAUSE',
      `${pair} × ${strat?.name ?? strategyId} × ${timeframe} pausada manualmente via dashboard por ${(session.user as any)?.email ?? (session.user as any)?.name ?? 'usuário'}.`,
      { strategyId, pair, timeframe }
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Pause combo error:', error);
    return NextResponse.json({ error: 'Erro ao pausar combinação' }, { status: 500 });
  }
}
