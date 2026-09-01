export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getRadarUniverse } from '@/lib/universe';
import { getKlines } from '@/lib/binance';
import { calcVWAP, calcMACD, calcROC, calcATR, calcEMA } from '@/lib/indicators';
import { classifyRegime } from '@/lib/regime';
import { scoreCandidate } from '@/lib/radar-score';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const testPair = searchParams.get('pair');

    const universe = await getRadarUniverse(100);

    let sample: any = null;
    let regime: any = null;
    let score: any = null;
    const pairToTest = testPair || universe?.[0]?.symbol;
    if (pairToTest) {
      const klines = await getKlines(pairToTest, '15m', 100);
      const closes = klines.map((k) => k.close);
      const vwap = calcVWAP(klines);
      const macd = calcMACD(closes);
      const roc = calcROC(closes);
      const atr = calcATR(klines);
      const ema20 = calcEMA(closes, 20);
      const lastPrice = closes[closes.length - 1] ?? null;

      sample = {
        pair: pairToTest,
        lastPrice,
        vwap,
        priceAboveVwap: vwap !== null && lastPrice !== null ? lastPrice > vwap : null,
        macd,
        roc,
        atr,
        ema20: ema20[ema20.length - 1] ?? null,
        candlesUsed: klines.length,
      };

      // Regime precisa de bem mais candles (EMA200 estável) — busca à parte,
      // em 1h, que é o timeframe que faz mais sentido pra leitura de
      // estrutura (não é ruído de curtíssimo prazo).
      const regimeKlines = await getKlines(pairToTest, '1h', 300);
      regime = classifyRegime(regimeKlines);

      // Score reusa a mesma busca de 1h internamente.
      score = await scoreCandidate(pairToTest, '1h');
    }

    return NextResponse.json({
      universeSize: universe.length,
      universe: universe.slice(0, 100),
      sample,
      regime,
      score,
    });
  } catch (error: any) {
    console.error('Radar data-check error:', error);
    return NextResponse.json({ error: 'Erro ao verificar dados do radar' }, { status: 500 });
  }
}
