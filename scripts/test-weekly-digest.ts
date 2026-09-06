/**
 * Envio manual de TESTE do resumo semanal (Fase 11, 05/09/2026) — usa o
 * MESMO conteúdo do envio automático real (buildWeeklyDigestContent, em
 * lib/weekly-digest.ts), mas:
 *   - ignora o throttle de 1x/semana (roda na hora)
 *   - NÃO atualiza o throttle — o próximo envio automático real
 *     continua acontecendo no prazo normal, sem alteração
 *   - NÃO grava PilotActionLog como se fosse um envio real
 *   - prefixa a mensagem com "🧪 TESTE" pra nunca ser confundida com o
 *     resumo semanal de verdade
 * Envia pros MESMOS inscritos reais (Telegram/e-mail configurados em
 * Configurações) — é assim que dá pra ver como a mensagem real vai ficar.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/test-weekly-digest.ts
 *   (ou: npm run test:weekly-digest)
 */
import { prisma } from '../lib/prisma';
import { buildWeeklyDigestContent } from '../lib/weekly-digest';

async function main() {
  const { text, emailHtml } = await buildWeeklyDigestContent();

  const testText = `🧪 <b>TESTE — este envio não conta como o resumo semanal real</b>\n\n${text}`;
  const testEmailHtml = emailHtml.replace(
    '<h2 style="color: #f0b90b;">📊 Resumo semanal — Robô Trade</h2>',
    '<div style="background:#f0b90b;color:#000;padding:8px 12px;border-radius:6px;margin-bottom:12px;font-weight:bold;">🧪 TESTE — este envio não conta como o resumo semanal real</div>' +
      '<h2 style="color: #f0b90b;">📊 Resumo semanal — Robô Trade</h2>'
  );

  const subscribers = await prisma.userSettings.findMany({
    where: {
      OR: [
        { emailAlerts: true, alertEmail: { not: null } },
        { telegramAlerts: true, telegramChatId: { not: null } },
      ],
    },
  });

  if (!subscribers.length) {
    console.log('Nenhum inscrito com emailAlerts/telegramAlerts configurado — nada pra enviar.');
    console.log('\nConteúdo que seria enviado:\n');
    console.log(text);
    return;
  }

  const { sendTelegramMessage } = await import('../lib/telegram');
  const { sendEmail } = await import('../lib/mailer');

  for (const sub of subscribers) {
    if (sub.telegramAlerts && sub.telegramChatId) {
      try {
        await sendTelegramMessage(sub.telegramChatId, testText);
        console.log(`Telegram de teste enviado (chatId ${sub.telegramChatId}).`);
      } catch (e: any) {
        console.error('Falha ao enviar Telegram de teste:', e?.message);
      }
    }
    if (sub.emailAlerts && sub.alertEmail) {
      try {
        await sendEmail({ to: sub.alertEmail, subject: '🧪 TESTE — Robô Trade — Resumo semanal', html: testEmailHtml });
        console.log(`E-mail de teste enviado (${sub.alertEmail}).`);
      } catch (e: any) {
        console.error('Falha ao enviar e-mail de teste:', e?.message);
      }
    }
  }

  console.log('\nTeste concluído. O throttle do resumo semanal REAL não foi tocado — o próximo envio automático continua no prazo normal (1x/semana).');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[test-weekly-digest] Falha:', e?.message ?? e);
    process.exit(1);
  });
