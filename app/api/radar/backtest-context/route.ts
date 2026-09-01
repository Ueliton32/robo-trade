export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { backtestRegimeFilteredStrategy } from '@/lib/radar-context-backtest';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    const body = await request.json();
    const strategyId = Number(body?.strategyId);
    const pair = String(body?.pair ?? '');
    const timeframe = String(body?.timeframe ?? '');
    const months = Number(body?.months ?? 2);

    if (!pair) return NextResponse.json({ error: 'Par n\u00e3o informado' }, { status: 400 });
    if (!strategyId) return NextResponse.json({ error: 'Estrat\u00e9gia n\u00e3o informada' }, { status: 400 });

    const result = await backtestRegimeFilteredStrategy({ strategyId, pair, timeframe, months });
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Radar context backtest error:', error);
    return NextResponse.json({ error: error?.message ?? 'Erro ao rodar backtest com filtro de regime' }, { status: 500 });
  }
}
