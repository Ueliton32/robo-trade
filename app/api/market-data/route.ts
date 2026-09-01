export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getTicker24h, getFundingRate, getOpenInterest, MONITORED_PAIRS } from '@/lib/binance';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    let pairs: string[] = MONITORED_PAIRS;
    if (session?.user) {
      const userId = (session.user as any)?.id;
      const settings = await prisma.userSettings.findUnique({ where: { userId } });
      if (settings?.monitoredPairs?.length) pairs = settings.monitoredPairs;
    }

    const results = await Promise.all(
      pairs.map(async (pair: string) => {
        const [ticker, funding, oi] = await Promise.all([
          getTicker24h(pair),
          getFundingRate(pair),
          getOpenInterest(pair),
        ]);
        return {
          symbol: pair,
          price: parseFloat(ticker?.lastPrice ?? '0'),
          priceChange: parseFloat(ticker?.priceChangePercent ?? '0'),
          volume24h: parseFloat(ticker?.quoteVolume ?? '0'),
          high24h: parseFloat(ticker?.highPrice ?? '0'),
          low24h: parseFloat(ticker?.lowPrice ?? '0'),
          fundingRate: parseFloat(funding?.fundingRate ?? '0'),
          openInterest: parseFloat(oi?.openInterest ?? '0'),
        };
      })
    );
    return NextResponse.json({ data: results, timestamp: Date.now() });
  } catch (error: any) {
    console.error('Market data error:', error);
    return NextResponse.json({ data: [], timestamp: Date.now(), error: 'Falha ao buscar dados' }, { status: 500 });
  }
}
