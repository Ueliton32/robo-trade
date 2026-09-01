export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    const results = await prisma.radarContextScan.findMany({ orderBy: { filteredPF: 'desc' } });
    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('Radar context scan results error:', error);
    return NextResponse.json({ error: 'Erro ao buscar resultados', results: [] }, { status: 500 });
  }
}
