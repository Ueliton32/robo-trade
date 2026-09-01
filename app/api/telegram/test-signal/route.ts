export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { sendSignalTelegram } from '@/lib/signal-telegram';
import { SignalData } from '@/lib/strategies';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    const body = await request.json();
    const chatId = body?.chatId;
    if (!chatId) return NextResponse.json({ error: 'Chat ID n\u00e3o informado' }, { status: 400 });

    // Sinal fictício, só pra exercitar o MESMO caminho de código que o
    // agendador usa de verdade (formatação de preço, template, envio).
    const mockSignal: SignalData = {
      strategyId: 2,
      strategyName: 'Pullback na EMA20 (SINAL DE TESTE)',
      pair: 'XRPUSDT',
      direction: 'LONG',
      timeframe: '1h',
      mode: 'Day Trade',
      entryPrice: 1.0756,
      target1: 1.0921,
      target2: 1.1050,
      stopLoss: 1.0698,
      leverage: '5x-10x',
      confidence: 68,
      reason: 'Isto é um sinal de teste gerado manualmente para verificar o envio — não é uma recomendação real.',
    };

    await sendSignalTelegram(mockSignal, chatId);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Telegram test-signal error:', error);
    return NextResponse.json({ error: error?.message ?? 'Erro ao enviar sinal de teste' }, { status: 500 });
  }
}
