// Resumo semanal consolidado — junta em uma mensagem só o que hoje só dá
// pra ver abrindo 3 telas diferentes (sinais, backtest, estatísticas):
// quantos sinais novos, quantos fecharam e como, quantas divergências,
// quantas pausas. Chamado 1x/semana pelo agendador, mesmo padrão de
// throttle de runDailyDivergenceCheckIfDue e runWeeklyStabilityScanIfDue.
import { prisma } from './prisma';
import { computeMetrics, TradeLike } from './metrics';
import { logPilotEvent } from './pilot-log';

const WEEKLY_DIGEST_STATE_KEY = 'last_weekly_digest';
const MIN_HOURS_BETWEEN_DIGESTS = 24 * 7;

export async function runWeeklyDigestIfDue(): Promise<{ ran: boolean }> {
  const state = await prisma.systemState.findUnique({ where: { key: WEEKLY_DIGEST_STATE_KEY } });
  if (state) {
    const hoursSince = (Date.now() - new Date(state.value).getTime()) / (1000 * 60 * 60);
    if (hoursSince < MIN_HOURS_BETWEEN_DIGESTS) return { ran: false };
  }

  const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const newSignals = await prisma.signal.count({ where: { source: 'live', createdAt: { gte: sinceDate } } });
  const closedSignals = await prisma.signal.findMany({
    where: { source: 'live', status: { in: ['WIN', 'LOSS'] }, closedAt: { gte: sinceDate } },
  });
  const metrics = computeMetrics(closedSignals as unknown as TradeLike[]);

  const pausedNow = await prisma.divergenceStreak.count({ where: { paused: true } });
  const pausedThisWeek = await prisma.pilotActionLog.count({
    where: { type: { in: ['AUTO_PAUSE', 'MANUAL_PAUSE'] }, createdAt: { gte: sinceDate } },
  });
  const divergenceChecks = await prisma.pilotActionLog.count({
    where: { type: 'DIVERGENCE_DETECTED', createdAt: { gte: sinceDate } },
  });
  const cycleErrors = await prisma.pilotActionLog.count({
    where: { type: 'CYCLE_ERROR', createdAt: { gte: sinceDate } },
  });

  const text =
    `📊 <b>Resumo semanal — Robô Trade</b>\n\n` +
    `${newSignals} sinal(is) novo(s) gerado(s)\n` +
    `${closedSignals.length} fechado(s): ${metrics.wins} WIN / ${metrics.losses} LOSS (WR ${metrics.winRate.toFixed(1)}%, PF ${metrics.profitFactor.toFixed(2)}, expectativa ${metrics.expectancy.toFixed(2)}%)\n` +
    `${pausedThisWeek} combinação(ões) pausada(s) essa semana (${pausedNow} pausada(s) no total agora)\n` +
    `${divergenceChecks} dia(s) com divergência detectada\n` +
    (cycleErrors > 0 ? `⚠️ ${cycleErrors} ciclo(s) com erro essa semana\n` : '') +
    `\nConfira o dashboard pra detalhe por combinação.`;

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e1a; color: #fff; padding: 24px; border-radius: 12px;">
      <h2 style="color: #f0b90b;">📊 Resumo semanal — Robô Trade</h2>
      <ul>
        <li>${newSignals} sinal(is) novo(s) gerado(s)</li>
        <li>${closedSignals.length} fechado(s): ${metrics.wins} WIN / ${metrics.losses} LOSS (WR ${metrics.winRate.toFixed(1)}%, PF ${metrics.profitFactor.toFixed(2)})</li>
        <li>${pausedThisWeek} combinação(ões) pausada(s) essa semana (${pausedNow} no total agora)</li>
        <li>${divergenceChecks} dia(s) com divergência detectada</li>
        ${cycleErrors > 0 ? `<li style="color:#f87171;">${cycleErrors} ciclo(s) com erro essa semana</li>` : ''}
      </ul>
      <p>Confira o dashboard pra detalhe por combinação.</p>
    </div>
  `;

  const subscribers = await prisma.userSettings.findMany({
    where: {
      OR: [
        { emailAlerts: true, alertEmail: { not: null } },
        { telegramAlerts: true, telegramChatId: { not: null } },
      ],
    },
  });

  if (subscribers.length > 0) {
    const { sendTelegramMessage } = await import('./telegram');
    const { sendEmail } = await import('./mailer');

    for (const sub of subscribers) {
      if (sub.telegramAlerts && sub.telegramChatId) {
        try { await sendTelegramMessage(sub.telegramChatId, text); } catch (e: any) { console.error('Weekly digest Telegram error:', e?.message); }
      }
      if (sub.emailAlerts && sub.alertEmail) {
        try { await sendEmail({ to: sub.alertEmail, subject: '📊 Robô Trade — Resumo semanal', html: emailHtml }); } catch (e: any) { console.error('Weekly digest email error:', e?.message); }
      }
    }
  }

  await logPilotEvent('WEEKLY_DIGEST', text.replace(/<\/?b>/g, ''));

  await prisma.systemState.upsert({
    where: { key: WEEKLY_DIGEST_STATE_KEY },
    update: { value: new Date().toISOString() },
    create: { key: WEEKLY_DIGEST_STATE_KEY, value: new Date().toISOString() },
  });

  return { ran: true };
}
