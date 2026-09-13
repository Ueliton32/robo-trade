import fs from 'node:fs/promises';
import path from 'node:path';
import { REPORT_ROOT } from './contracts';

export interface ProductivityBaseline {
  hypothesis: string[];
  manualAuditHoursMonthlyBefore: number | null;
  manualAuditHoursMonthlyAfter: number | null;
  automatedChecksRun: number;
  failuresCaughtBeforeNextEnvironment: number;
  regressionsDetected: number;
  falseAlerts: number;
  modelCallsByRoutine: Record<string, number>;
  computationalCostNotes: string[];
}

export const INITIAL_PRODUCTIVITY_BASELINE: ProductivityBaseline = {
  hypothesis: [
    'redução de 50% a 70% no tempo de leitura e auditoria',
    'redução de 40% a 60% no trabalho repetitivo de testes e documentação',
    'redução de 30% a 50% no tempo entre especificação e implementação',
    'redução relevante do acompanhamento manual de falhas e regressões',
  ],
  manualAuditHoursMonthlyBefore: null,
  manualAuditHoursMonthlyAfter: null,
  automatedChecksRun: 0,
  failuresCaughtBeforeNextEnvironment: 0,
  regressionsDetected: 0,
  falseAlerts: 0,
  modelCallsByRoutine: { daily: 0, update: 0, weekly: 0, monthly: 0 },
  computationalCostNotes: ['Rotinas determinísticas em no_agent=true; chamada de modelo só para resumo executivo em WARNING/CRITICAL se habilitada depois.'],
};

export async function ensureProductivityBaseline(): Promise<string> {
  const dir = path.join(process.cwd(), REPORT_ROOT, 'baselines');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, 'productivity-baseline.json');
  try { await fs.access(file); } catch { await fs.writeFile(file, JSON.stringify(INITIAL_PRODUCTIVITY_BASELINE, null, 2)); }
  return file;
}
