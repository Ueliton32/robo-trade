import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { MonitoringRunResult, REPORT_ROOT } from './contracts';
import { shouldNotifyIncident, IncidentNotificationRecord } from './alert-dedupe';
import { redactSecrets } from './redaction';

export function incidentFingerprint(run: MonitoringRunResult): string {
  const critical = run.checks.filter((c) => c.status === 'CRITICAL').map((c) => ({ id: c.id, evidence: c.evidence }));
  return createHash('sha256').update(JSON.stringify(redactSecrets(critical))).digest('hex');
}

export async function maybeNotifyCritical(run: MonitoringRunResult): Promise<{ notified: boolean; reason: string }> {
  if (run.overallStatus !== 'CRITICAL') return { notified: false, reason: 'not critical' };
  const dir = path.join(process.cwd(), REPORT_ROOT, 'incidents');
  await fs.mkdir(dir, { recursive: true });
  const historyPath = path.join(dir, 'notification-history.json');
  let history: IncidentNotificationRecord[] = [];
  try { history = JSON.parse(await fs.readFile(historyPath, 'utf8')); } catch {}
  const fingerprint = incidentFingerprint(run);
  const decision = shouldNotifyIncident(history, fingerprint, new Date(), 180);
  await fs.writeFile(historyPath, JSON.stringify(decision.updated, null, 2));
  if (!decision.shouldNotify) return { notified: false, reason: 'duplicate suppressed' };

  const summary = `🔴 <b>Robô Trade — monitoramento CRITICAL</b>\n\nRotina: ${run.kind}\nCommit: ${run.commitSha}\nChecks críticos: ${run.checks.filter((c) => c.status === 'CRITICAL').map((c) => c.id).join(', ')}\nAção: verificar relatório em reports/monitoring/${run.kind === 'update' ? 'regressions' : run.kind}`;
  try {
    const { prisma } = await import('@/lib/prisma');
    const { sendTelegramMessage } = await import('@/lib/telegram');
    const subscribers = await prisma.userSettings.findMany({ where: { telegramAlerts: true, telegramChatId: { not: null } }, select: { telegramChatId: true } });
    if (!subscribers.length) {
      await fs.writeFile(path.join(dir, `${run.kind}-${fingerprint}.notification.txt`), summary + '\nTelegram não configurado para nenhum usuário.');
      return { notified: false, reason: 'telegram subscribers not configured; local incident file written' };
    }
    for (const sub of subscribers) await sendTelegramMessage(sub.telegramChatId!, summary);
    return { notified: true, reason: 'telegram sent' };
  } catch (e: any) {
    await fs.writeFile(path.join(dir, `${run.kind}-${fingerprint}.notification.txt`), summary + `\nnotify error: ${e?.message ?? e}`);
    return { notified: false, reason: 'telegram unavailable; local incident file written' };
  }
}
