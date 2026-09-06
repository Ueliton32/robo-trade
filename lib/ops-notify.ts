// Notificação operacional (status do robô: falhas seguidas, recuperação,
// circuit breaker disparado/resetado). Extraído de lib/cycle-runner.ts
// (04/09/2026, Fase 8) pra lib/circuit-breakers.ts poder notificar também
// sem criar import circular (cycle-runner → analysis-engine →
// circuit-breakers → cycle-runner, se circuit-breakers importasse de lá).
// Comportamento idêntico ao que já existia — só mudou de arquivo.
import { prisma } from './prisma';

export async function notifyOps(text: string): Promise<void> {
  try {
    const { sendTelegramMessage } = await import('./telegram');
    const { sendEmail } = await import('./mailer');
    const subscribers = await prisma.userSettings.findMany({
      where: { OR: [{ emailAlerts: true, alertEmail: { not: null } }, { telegramAlerts: true, telegramChatId: { not: null } }] },
    });
    for (const sub of subscribers) {
      if (sub.telegramAlerts && sub.telegramChatId) {
        try { await sendTelegramMessage(sub.telegramChatId, text); } catch (e: any) { console.error('Ops Telegram error:', e?.message); }
      }
      if (sub.emailAlerts && sub.alertEmail) {
        try { await sendEmail({ to: sub.alertEmail, subject: 'Robô Trade — status do agendador', html: `<div style="font-family:Arial,sans-serif;">${text.replace(/\n/g, '<br/>')}</div>` }); } catch (e: any) { console.error('Ops email error:', e?.message); }
      }
    }
  } catch (e: any) {
    console.error('[ops-notify] Falha ao notificar status operacional:', e?.message);
  }
}
