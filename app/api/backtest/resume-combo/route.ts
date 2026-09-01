export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { STRATEGY_DEFS } from '@/lib/strategies';
import { resumeDivergentCombo } from '@/lib/divergence-check';
import { logPilotEvent } from '@/lib/pilot-log';

const VALID_STRATEGY_IDS = STRATEGY_DEFS.map((s) => s.id) as [number, ...number[]];

const bodySchema = z.object({
  strategyId: z.number().int().refine((id) => VALID_STRATEGY_IDS.includes(id), 'ID de estratégia inválido'),
  pair: z.string().min(1),
  timeframe: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { strategyId, pair, timeframe } = parsed.data;

    await resumeDivergentCombo(strategyId, pair, timeframe);

    const strat = STRATEGY_DEFS.find((s) => s.id === strategyId);
    await logPilotEvent(
      'MANUAL_RESUME',
      `${pair} × ${strat?.name ?? strategyId} × ${timeframe} reativada manualmente via dashboard por ${(session.user as any)?.email ?? (session.user as any)?.name ?? 'usuário'}.`,
      { strategyId, pair, timeframe }
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Resume combo error:', error);
    return NextResponse.json({ error: 'Erro ao reativar combinação' }, { status: 500 });
  }
}
