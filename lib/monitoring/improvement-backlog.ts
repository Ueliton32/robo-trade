import fs from 'node:fs/promises';
import path from 'node:path';
import { REPORT_ROOT } from './contracts';
import type { ImprovementBacklog, ImprovementHypothesis, ImprovementHypothesisStatus } from './continuous-improvement';

export const BACKLOG_JSON = path.join(REPORT_ROOT, 'improvement-backlog.json');
export const BACKLOG_MD = path.join(REPORT_ROOT, 'improvement-backlog.md');

const STATUSES: ImprovementHypothesisStatus[] = ['OBSERVED', 'UNDER_REVIEW', 'APPROVED_FOR_EXPERIMENT', 'IN_EXPERIMENT', 'VALIDATED', 'REJECTED', 'APPROVED_FOR_IMPLEMENTATION', 'IMPLEMENTED', 'MONITORING', 'ROLLED_BACK'];
const APPROVAL_ONLY: ImprovementHypothesisStatus[] = ['APPROVED_FOR_EXPERIMENT', 'IN_EXPERIMENT', 'APPROVED_FOR_IMPLEMENTATION', 'IMPLEMENTED', 'MONITORING', 'ROLLED_BACK'];

export function emptyBacklog(now = new Date().toISOString()): ImprovementBacklog {
  return { version: 1, updatedAt: now, hypotheses: [] };
}

export function validateBacklog(backlog: ImprovementBacklog): void {
  if (backlog.version !== 1) throw new Error('Unsupported improvement backlog version');
  if (!Array.isArray(backlog.hypotheses)) throw new Error('Backlog hypotheses must be an array');
  const ids = new Set<string>();
  for (const h of backlog.hypotheses) {
    if (!/^HYP-\d{4}-\d{4}$/.test(h.id)) throw new Error(`Invalid hypothesis id: ${h.id}`);
    if (ids.has(h.id)) throw new Error(`Duplicate hypothesis id: ${h.id}`);
    ids.add(h.id);
    if (!STATUSES.includes(h.status)) throw new Error(`Invalid hypothesis status: ${h.status}`);
    for (const key of ['sourceReport', 'observedProblem', 'hypothesis', 'proposedExperiment'] as const) {
      if (!h[key]) throw new Error(`Missing required hypothesis field ${key} in ${h.id}`);
    }
  }
}

export function transitionHypothesisStatus(h: ImprovementHypothesis, next: ImprovementHypothesisStatus, actor: 'automatic' | 'user-approved'): ImprovementHypothesis {
  if (actor !== 'user-approved' && APPROVAL_ONLY.includes(next)) {
    throw new Error(`Transition to ${next} requires explicit user approval`);
  }
  return { ...h, status: next, updatedAt: new Date().toISOString() };
}

export async function loadImprovementBacklog(root = process.cwd()): Promise<ImprovementBacklog> {
  const p = path.join(root, BACKLOG_JSON);
  try {
    const parsed = JSON.parse(await fs.readFile(p, 'utf8')) as ImprovementBacklog;
    validateBacklog(parsed);
    return parsed;
  } catch (e: any) {
    if (e?.code === 'ENOENT') return emptyBacklog();
    throw e;
  }
}

export async function saveImprovementBacklog(backlog: ImprovementBacklog, root = process.cwd()): Promise<{ jsonPath: string; mdPath: string }> {
  const jsonPath = path.join(root, BACKLOG_JSON);
  const mdPath = path.join(root, BACKLOG_MD);
  const next = { ...backlog, updatedAt: new Date().toISOString() };
  validateBacklog(next);
  await fs.mkdir(path.dirname(jsonPath), { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(next, null, 2));
  await fs.writeFile(mdPath, renderImprovementBacklogMarkdown(next));
  return { jsonPath, mdPath };
}

export function renderImprovementBacklogMarkdown(backlog: ImprovementBacklog): string {
  if (!backlog.hypotheses.length) return `# Backlog de melhoria contínua\n\n- Atualizado em: ${backlog.updatedAt}\n\nNenhuma hipótese registrada.\n`;
  return `# Backlog de melhoria contínua\n\n- Atualizado em: ${backlog.updatedAt}\n- Hipóteses: ${backlog.hypotheses.length}\n\n` + backlog.hypotheses.map((h) => `## ${h.id} — ${h.status}\n\n- Criada em: ${h.createdAt}\n- Relatório de origem: ${h.sourceReport}\n- Tipo: ${h.problemType}\n- Prioridade: ${h.priority}\n- Recorrência: ${h.recurrence} (${h.observations})\n- Problema observado: ${h.observedProblem}\n- Hipótese: ${h.hypothesis}\n- Mecanismo esperado: ${h.expectedMechanism}\n- Experimento: ${h.proposedExperiment}\n- Métricas primárias: ${h.primaryMetrics.join(', ')}\n- Métricas de segurança: ${h.safetyMetrics.join(', ')}\n- Critérios de aprovação: ${h.approvalCriteria.join('; ')}\n- Critérios de rejeição: ${h.rejectionCriteria.join('; ')}\n- Riscos: ${h.risks.join('; ')}\n- Decisão final: ${h.finalDecision ?? 'pendente'}\n- Conclusão: ${h.conclusion ?? 'pendente'}\n`).join('\n');
}
