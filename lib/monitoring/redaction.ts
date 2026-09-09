const PATTERNS: RegExp[] = [
  /postgres(?:ql)?:\/\/[^\s'\"]+/gi,
  /(DATABASE_URL\s*=\s*)[^\s'\"]+/gi,
  /(TELEGRAM_BOT_TOKEN\s*=\s*)[^\s'\"]+/gi,
  /(NEXTAUTH_SECRET\s*=\s*)[^\s'\"]+/gi,
  /(CRON_SECRET\s*=\s*)[^\s'\"]+/gi,
  /((?:api[_-]?key|token|password|passwd|secret)\s*[:=]\s*)[^\s'\"]+/gi,
];

export function redactSecrets<T>(value: T): T {
  if (typeof value === 'string') {
    let out: string = value;
    for (const pattern of PATTERNS) {
      out = out.replace(pattern, (_match: string, prefix?: string) => prefix ? `${prefix}[REDACTED]` : '[REDACTED]');
    }
    return out as T;
  }
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redactSecrets(v)])) as T;
  }
  return value;
}
