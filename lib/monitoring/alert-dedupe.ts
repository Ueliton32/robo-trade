export interface IncidentNotificationRecord {
  fingerprint: string;
  notifiedAt: string;
}

export function shouldNotifyIncident(
  previous: IncidentNotificationRecord[],
  fingerprint: string,
  now: Date,
  cooldownMinutes = 180
): { shouldNotify: boolean; updated: IncidentNotificationRecord[] } {
  const last = previous
    .filter((r) => r.fingerprint === fingerprint)
    .sort((a, b) => new Date(b.notifiedAt).getTime() - new Date(a.notifiedAt).getTime())[0];
  const withinCooldown = last && now.getTime() - new Date(last.notifiedAt).getTime() < cooldownMinutes * 60_000;
  if (withinCooldown) return { shouldNotify: false, updated: previous };
  return { shouldNotify: true, updated: [...previous, { fingerprint, notifiedAt: now.toISOString() }] };
}
