const TELEGRAM_API = 'https://api.telegram.org';

function getBotToken(): string | null {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = getBotToken();
  if (!token) {
    console.warn(
      '[telegram] TELEGRAM_BOT_TOKEN não configurado — alerta por Telegram ignorado. ' +
      'Crie um bot com o @BotFather e defina TELEGRAM_BOT_TOKEN no .env para habilitar.'
    );
    return;
  }

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram API respondeu ${res.status}: ${body}`);
  }
}

/**
 * Lista as conversas mais recentes que alguém iniciou com o bot (via
 * getUpdates), pra ajudar o usuário a descobrir o próprio chat_id sem
 * precisar mexer em nenhum bot terceiro. Cada pessoa deve mandar pelo
 * menos uma mensagem pro bot dela antes de aparecer aqui.
 */
export async function getRecentTelegramChats(): Promise<Array<{ chatId: string; name: string; lastMessage: string }>> {
  const token = getBotToken();
  if (!token) return [];

  const res = await fetch(`${TELEGRAM_API}/bot${token}/getUpdates?limit=50`);
  if (!res.ok) return [];

  const data = await res.json();
  const updates: any[] = data?.result ?? [];

  const chats = new Map<string, { chatId: string; name: string; lastMessage: string }>();
  for (const u of updates) {
    const msg = u?.message;
    const chat = msg?.chat;
    if (!chat?.id) continue;
    const name = [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || `Chat ${chat.id}`;
    chats.set(String(chat.id), {
      chatId: String(chat.id),
      name,
      lastMessage: msg?.text ?? '',
    });
  }

  return Array.from(chats.values());
}
