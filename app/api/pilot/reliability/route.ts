export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { computeReliabilityScore } from '@/lib/reliability-score';

// Índice de confiabilidade atual + histórico de snapshots (pra virar
// gráfico de evolução semana a semana no dashboard). Ver
// lib/reliability-score.ts pro racional completo — mede maturidade
// técnica/operacional, nunca é recomendação de investimento.
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const [current, history] = await Promise.all([
      computeReliabilityScore(),
      prisma.reliabilitySnapshot.findMany({ orderBy: { createdAt: 'asc' }, take: 90 }),
    ]);

    return NextResponse.json({ current, history });
  } catch (error: any) {
    console.error('Reliability score error:', error);
    return NextResponse.json({ error: 'Erro ao calcular índice de confiabilidade' }, { status: 500 });
  }
}
