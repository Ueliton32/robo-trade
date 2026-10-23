import { DecisionEngine } from '@/lib/monitoring/lp/decision-engine/decision-engine';
import { DecisionReport } from '@/types/dashboard';

let cachedReport: DecisionReport | null = null;
let cacheTs = 0;

export async function getDecisionReport(): Promise<DecisionReport> {
  const now = Date.now();
  if (cachedReport && now - cacheTs < 60000) {
    return cachedReport;
  }
  try {
    const engine = new DecisionEngine();
    const report = engine.run() as DecisionReport;
    cachedReport = report;
    cacheTs = now;
    return report;
  } catch (e) {
    console.error('Decision engine error', e);
    throw new Error('Failed to load decision report');
  }
}

export async function refreshDecisionReport(): Promise<DecisionReport> {
  const engine = new DecisionEngine();
  const report = engine.run() as DecisionReport;
  cachedReport = report;
  cacheTs = Date.now();
  return report;
}
