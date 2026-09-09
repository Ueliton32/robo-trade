import type { Kline } from '@/lib/binance';
import type { MonitoringStatus } from './contracts';

export type KlineIssueCode = 'DUPLICATE_CANDLE' | 'MISSING_CANDLE' | 'OUT_OF_ORDER' | 'IRREGULAR_INTERVAL' | 'NULL_VALUE' | 'NON_FINITE_VALUE' | 'INVALID_PRICE_RANGE' | 'INVALID_VOLUME' | 'ABNORMAL_GAP';
export interface KlineIntegrityIssue { code: KlineIssueCode; index: number; evidence: unknown }

export function intervalMsForTimeframe(tf: string): number {
  const map: Record<string, number> = { '1m': 60_000, '5m': 300_000, '15m': 900_000, '1h': 3_600_000, '4h': 14_400_000, '1d': 86_400_000 };
  return map[tf] ?? 3_600_000;
}

export function classifyDelay(lastCloseTime: number, now: number, expectedIntervalMs: number): { status: MonitoringStatus; delayMs: number } {
  const delayMs = Math.max(0, now - lastCloseTime);
  if (delayMs > expectedIntervalMs * 5) return { status: 'CRITICAL', delayMs };
  if (delayMs > expectedIntervalMs * 2) return { status: 'WARNING', delayMs };
  return { status: 'OK', delayMs };
}

function badNumber(v: unknown): 'NULL_VALUE' | 'NON_FINITE_VALUE' | null {
  if (v === null || v === undefined || v === '') return 'NULL_VALUE';
  return typeof v !== 'number' || !Number.isFinite(v) ? 'NON_FINITE_VALUE' : null;
}

export function detectKlineIntegrityIssues(rows: Kline[], expectedIntervalMs: number): KlineIntegrityIssue[] {
  const issues: KlineIntegrityIssue[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < rows.length; i++) {
    const k = rows[i] as any;
    for (const field of ['openTime', 'closeTime', 'open', 'high', 'low', 'close', 'volume']) {
      const code = badNumber(k[field]);
      if (code) issues.push({ code, index: i, evidence: { field, value: k[field] } });
    }
    if (seen.has(k.openTime)) issues.push({ code: 'DUPLICATE_CANDLE', index: i, evidence: { openTime: k.openTime } });
    seen.add(k.openTime);
    if (k.volume < 0) issues.push({ code: 'INVALID_VOLUME', index: i, evidence: { volume: k.volume } });
    if (k.open <= 0 || k.high <= 0 || k.low <= 0 || k.close <= 0 || k.high < Math.max(k.open, k.close) || k.low > Math.min(k.open, k.close)) issues.push({ code: 'INVALID_PRICE_RANGE', index: i, evidence: k });
    if (i > 0) {
      const prev = rows[i - 1] as any;
      const delta = k.openTime - prev.openTime;
      if (delta < 0) issues.push({ code: 'OUT_OF_ORDER', index: i, evidence: { previous: prev.openTime, current: k.openTime } });
      if (delta > expectedIntervalMs) issues.push({ code: 'MISSING_CANDLE', index: i, evidence: { previous: prev.openTime, current: k.openTime, delta } });
      if (delta !== expectedIntervalMs && delta >= 0) issues.push({ code: 'IRREGULAR_INTERVAL', index: i, evidence: { delta, expectedIntervalMs } });
      const gapPct = prev.close > 0 ? Math.abs(k.open - prev.close) / prev.close : 0;
      if (gapPct > 0.08) issues.push({ code: 'ABNORMAL_GAP', index: i, evidence: { gapPct } });
    }
  }
  return issues;
}
