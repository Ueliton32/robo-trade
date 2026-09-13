import fs from 'node:fs/promises';
import path from 'node:path';
import { REPORT_ROOT } from './contracts';

export interface AcquiredLock { acquired: true; release: () => Promise<void>; path?: string }
export interface DeniedLock { acquired: false; reason: string; path?: string }
export type LockResult = AcquiredLock | DeniedLock;

export function createInMemoryRunLock() {
  const active = new Set<string>();
  return {
    async acquire(name: string): Promise<LockResult> {
      if (active.has(name)) return { acquired: false, reason: 'already running' };
      active.add(name);
      return { acquired: true, async release() { active.delete(name); } };
    },
  };
}

export async function acquireFileRunLock(name: string, ttlMinutes = 120): Promise<LockResult> {
  const dir = path.join(process.cwd(), REPORT_ROOT, 'locks');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${name}.lock`);
  const now = Date.now();
  try {
    const existing = JSON.parse(await fs.readFile(file, 'utf8')) as { startedAt: string };
    const age = now - new Date(existing.startedAt).getTime();
    if (Number.isFinite(age) && age < ttlMinutes * 60_000) return { acquired: false, reason: `already running since ${existing.startedAt}`, path: file };
  } catch {}
  await fs.writeFile(file, JSON.stringify({ name, pid: process.pid, startedAt: new Date(now).toISOString() }, null, 2));
  return { acquired: true, path: file, async release() { await fs.rm(file, { force: true }); } };
}
