export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { sendTelegramMessage } from '@/lib/telegram';

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    const body = await request.json();
    const chatId = body?.chatId;
    if (!chatId) return NextResponse.json({ error: 'Chat ID n\u00e3o informado' }, { status: 400 });

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json(
        { error: 'TELEGRAM_BOT_TOKEN n\u00e3o configurado no .env do servidor' },
        { status: 400 }
      );
    }

    await sendTelegramMessage(
      chatId,
      '✅ <b>Robô Trade</b>\n\nConexão funcionando! Você vai receber os sinais aqui.'
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Telegram test error:', error);
    return NextResponse.json({ error: error?.message ?? 'Erro ao enviar mensagem de teste' }, { status: 500 });
  }
}
