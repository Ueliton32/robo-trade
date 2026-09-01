import { sendTelegramMessage } from '@/lib/telegram';
import { SignalData } from '@/lib/strategies';
import { formatPrice } from '@/lib/utils';

export async function sendSignalTelegram(signal: SignalData, chatId: string): Promise<void> {
  const dirEmoji = signal.direction === 'LONG' ? '🟢' : '🔴';

  const text =
    `🤖 <b>Robô Trade — Novo Sinal</b>\n\n` +
    `${dirEmoji} <b>${signal.pair}</b> — <b>${signal.direction}</b>\n` +
    `📊 ${signal.strategyName}\n` +
    `⏱ ${signal.timeframe} · ${signal.mode}\n\n` +
    `Entrada: <code>${formatPrice(signal.entryPrice)}</code>\n` +
    `Alvo 1: <code>${formatPrice(signal.target1)}</code>\n` +
    `Alvo 2: <code>${formatPrice(signal.target2)}</code>\n` +
    `Stop: <code>${formatPrice(signal.stopLoss)}</code>\n\n` +
    `⚡ Alavancagem: ${signal.leverage}\n` +
    `🎯 Confiança: ${signal.confidence}%\n\n` +
    `<i>${signal.reason}</i>`;

  await sendTelegramMessage(chatId, text);
}

type SignalOutcome = 'WIN' | 'LOSS' | 'TARGET2';

interface ClosedSignalLike {
  pair: string;
  direction: string;
  strategyName: string;
  entryPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  pnlPercent: number | null;
}

/**
 * Notifica o resultado de um sinal que já foi enviado antes: alvo 1
 * atingido (WIN), stop atingido (LOSS), ou alvo 2 também atingido (bônus,
 * não muda o resultado já registrado).
 */
export async function sendOutcomeTelegram(signal: ClosedSignalLike, chatId: string, outcome: SignalOutcome): Promise<void> {
  const pnl = signal.pnlPercent ?? 0;
  const pnlText = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`;

  let header: string;
  let levelLine: string;
  if (outcome === 'WIN') {
    header = '🎯 <b>Alvo 1 atingido!</b>';
    levelLine = `Saída: <code>${formatPrice(signal.target1)}</code>`;
  } else if (outcome === 'LOSS') {
    header = '🔴 <b>Stop atingido</b>';
    levelLine = `Saída: <code>${formatPrice(signal.stopLoss)}</code>`;
  } else {
    header = '🚀 <b>Alvo 2 também atingido!</b>';
    levelLine = `Alvo 2: <code>${formatPrice(signal.target2)}</code>`;
  }

  const dirEmoji = signal.direction === 'LONG' ? '🟢' : '🔴';
  const text =
    `${header}\n\n` +
    `${dirEmoji} <b>${signal.pair}</b> — <b>${signal.direction}</b>\n` +
    `📊 ${signal.strategyName}\n\n` +
    `Entrada: <code>${formatPrice(signal.entryPrice)}</code>\n` +
    `${levelLine}\n` +
    (outcome !== 'TARGET2' ? `Resultado: <b>${pnlText}</b>` : `<i>(resultado já contabilizado no alvo 1)</i>`);

  await sendTelegramMessage(chatId, text);
}
