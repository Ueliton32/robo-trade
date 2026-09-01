export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getRecentTelegramChats } from '@/lib/telegram';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json(
        { error: 'TELEGRAM_BOT_TOKEN n\u00e3o configurado no .env do servidor', chats: [] },
        { status: 400 }
      );
    }

    const chats = await getRecentTelegramChats();
    return NextResponse.json({ chats });
  } catch (error: any) {
    console.error('Telegram updates error:', error);
    return NextResponse.json({ error: 'Erro ao buscar conversas', chats: [] }, { status: 500 });
  }
}
