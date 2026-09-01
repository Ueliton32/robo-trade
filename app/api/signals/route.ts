export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    const url = new URL(request.url);
    const strategyId = url.searchParams.get('strategyId');
    const status = url.searchParams.get('status'); // aceita "WIN" ou "WIN,LOSS"
    const since = url.searchParams.get('since');
    const limit = parseInt(url.searchParams.get('limit') ?? '50');

    // source:'live' sempre — nunca deixa sinal de demonstração/seed aparecer
    // misturado com dado real (importa especialmente pra cálculos em $).
    const where: any = { source: 'live' };
    if (strategyId) where.strategyId = parseInt(strategyId);
    if (status) where.status = { in: status.split(',') };
    if (since) where.createdAt = { gte: new Date(since) };

    const signals = await prisma.signal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });

    return NextResponse.json({ signals });
  } catch (error: any) {
    console.error('Signals error:', error);
    return NextResponse.json({ signals: [], error: 'Erro ao buscar sinais' }, { status: 500 });
  }
}
