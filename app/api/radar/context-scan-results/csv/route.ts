export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

const HEADERS = [
  'pair', 'strategyName', 'timeframe', 'months', 'totalDetected', 'totalAccepted',
  'unfilteredTrades', 'unfilteredWinRate', 'unfilteredPF', 'unfilteredExp',
  'filteredTrades', 'filteredWinRate', 'filteredPF', 'filteredExp', 'runAt',
];

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    const results = await prisma.radarContextScan.findMany({ orderBy: { filteredPF: 'desc' } });
    const rows = results.map((r: any) => HEADERS.map((h) => JSON.stringify(r?.[h] ?? '')).join(','));
    const csv = [HEADERS.join(','), ...rows].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="radar-context-scan-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Radar context scan CSV export error:', error);
    return NextResponse.json({ error: 'Erro ao gerar CSV' }, { status: 500 });
  }
}
