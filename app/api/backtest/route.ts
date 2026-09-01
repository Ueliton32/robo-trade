export const dynamic = 'force-dynamic';
export const maxDuration = 120;

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { runBacktest } from '@/lib/backtest-engine';
import { STRATEGY_DEFS } from '@/lib/strategies';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    const body = await request.json();
    const strategyId = Number(body?.strategyId);
    const pair = String(body?.pair ?? '');
    const timeframe = String(body?.timeframe ?? '');
    const months = Number(body?.months ?? 3);

    const strat = STRATEGY_DEFS.find((s) => s.id === strategyId);
    if (!strat) return NextResponse.json({ error: 'Estrat\u00e9gia inv\u00e1lida' }, { status: 400 });
    if (!pair) return NextResponse.json({ error: 'Par n\u00e3o informado' }, { status: 400 });
    if (strategyId !== 4 && !strat.timeframes.includes(timeframe)) {
      return NextResponse.json({ error: 'Timeframe inv\u00e1lido para essa estrat\u00e9gia' }, { status: 400 });
    }

    const result = await runBacktest({ strategyId, pair, timeframe, months });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Backtest error:', error);
    return NextResponse.json({ error: error?.message ?? 'Erro ao rodar backtest' }, { status: 500 });
  }
}
