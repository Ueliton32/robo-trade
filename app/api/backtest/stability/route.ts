export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { getPausedComboKeys } from '@/lib/divergence-check';

// Só leitura — mostra o último resultado salvo do stability-scan por
// combinação (lib/stability-engine.ts). Não dispara um scan novo (isso
// levaria minutos); pra atualizar de verdade, rode
// `npm run stability:scan` ou espere o agendador rodar 1x/semana.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const results = await prisma.stabilityScan.findMany({ orderBy: [{ verdict: 'asc' }, { runAt: 'desc' }] });
    const pausedCombos = await getPausedComboKeys();

    const order: Record<string, number> = { INSTAVEL: 0, ALTA_VARIANCIA: 1, AMOSTRA_INSUFICIENTE: 2, ESTAVEL: 3 };
    const sorted = results
      .sort((a, b) => (order[a.verdict] ?? 9) - (order[b.verdict] ?? 9))
      .map((r) => ({
        pair: r.pair,
        strategyId: r.strategyId,
        strategyName: r.strategyName,
        timeframe: r.timeframe,
        months: r.months,
        splits: r.splits,
        totalTrades: r.totalTrades,
        overallPF: r.overallPF,
        bucketPFs: r.bucketPFs,
        verdict: r.verdict,
        runAt: r.runAt,
        paused: pausedCombos.has(`${r.strategyId}|${r.pair}|${r.timeframe}`),
      }));

    return NextResponse.json({ results: sorted, lastRunAt: results[0]?.runAt ?? null });
  } catch (error: any) {
    console.error('Stability scan fetch error:', error);
    return NextResponse.json({ error: 'Erro ao buscar histórico de estabilidade', results: [] }, { status: 500 });
  }
}
