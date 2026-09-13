import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { REPORT_ROOT } from './contracts';

export interface BaselineComparison { baselinePath: string; baselineExists: boolean; changed: boolean; baselineHash?: string; currentHash: string }

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashObject(value: unknown): string { return createHash('sha256').update(stableStringify(value)).digest('hex'); }

export async function compareWithBaseline(name: string, current: unknown, createIfMissing = true): Promise<BaselineComparison> {
  const dir = path.join(process.cwd(), REPORT_ROOT, 'baselines');
  await fs.mkdir(dir, { recursive: true });
  const baselinePath = path.join(dir, `${name}.json`);
  const currentHash = hashObject(current);
  try {
    const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
    const baselineHash = hashObject(baseline);
    return { baselinePath, baselineExists: true, changed: baselineHash !== currentHash, baselineHash, currentHash };
  } catch {
    if (createIfMissing) await fs.writeFile(baselinePath, JSON.stringify(current, null, 2));
    return { baselinePath, baselineExists: false, changed: false, currentHash };
  }
}
