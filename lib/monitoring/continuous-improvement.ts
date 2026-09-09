import { createHash } from 'node:crypto';
import type { MonitoringCheckResult, MonitoringRunResult } from './contracts';

export const NO_STATISTICALLY_SUPPORTED_HYPOTHESIS = 'Nenhuma hipótese de melhoria estatisticamente sustentada neste período.';

export type ProblemType =
  | 'DATA_PROBLEM'
  | 'IMPLEMENTATION_PROBLEM'
  | 'SOFTWARE_REGRESSION'
  | 'SIMULATION_EXECUTION_PROBLEM'
  | 'REGIME_CHANGE'
  | 'STRATEGY_FRAGILITY'
  | 'STATISTICAL_VARIABILITY';

export type ImprovementHypothesisStatus =
  | 'OBSERVED'
  | 'UNDER_REVIEW'
  | 'APPROVED_FOR_EXPERIMENT'
  | 'IN_EXPERIMENT'
  | 'VALIDATED'
  | 'REJECTED'
  | 'APPROVED_FOR_IMPLEMENTATION'
  | 'IMPLEMENTED'
  | 'MONITORING'
  | 'ROLLED_BACK';

export interface ImprovementHypothesis {
  id: string;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
  sourceReport: string;
  observedProblem: string;
  evidence: unknown[];
  period: { start: string; end: string };
  recurrence: 'ISOLATED' | 'RECURRING' | 'UNKNOWN';
  observations: number;
  affectedAssets: string[];
  affectedTimeframes: string[];
  affectedFactors: string[];
  affectedRegimes: string[];
  problemType: ProblemType;
  hypothesis: string;
  expectedMechanism: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  estimatedImpact: string;
  estimatedEffort: 'LOW' | 'MEDIUM' | 'HIGH';
  risks: string[];
  overfittingRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  proposedExperiment: string;
  primaryMetrics: string[];
  safetyMetrics: string[];
  approvalCriteria: string[];
  rejectionCriteria: string[];
  status: ImprovementHypothesisStatus;
  finalDecision: string | null;
  testedInVersion: string | null;
  inSampleResult: string | null;
  outOfSampleResult: string | null;
  resultByRegime: string | null;
  conclusion: string | null;
}

export interface ImprovementBacklog {
  version: 1;
  updatedAt: string;
  hypotheses: ImprovementHypothesis[];
}

export interface ContinuousImprovementSummary {
  summary: string;
  newHypotheses: ImprovementHypothesis[];
  recurringHypotheses: ImprovementHypothesis[];
  awaitingApproval: ImprovementHypothesis[];
  inExperiment: ImprovementHypothesis[];
  rejected: ImprovementHypothesis[];
  implementedMonitoring: ImprovementHypothesis[];
  prioritizedRecommendations: ImprovementHypothesis[];
}

export interface ContinuousImprovementDerivation extends ContinuousImprovementSummary {
  backlog: ImprovementHypothesis[];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(run: MonitoringRunResult, check: MonitoringCheckResult, problemType: ProblemType): string {
  return createHash('sha256').update(stable({ kind: run.kind, id: check.id, problemType })).digest('hex').slice(0, 16);
}

function nextId(existing: ImprovementHypothesis[], now: string): string {
  const year = now.slice(0, 4);
  const max = existing.map((h) => h.id.match(new RegExp(`^HYP-${year}-(\\d{4})$`))?.[1]).filter(Boolean).map(Number).reduce((a, b) => Math.max(a, b), 0);
  return `HYP-${year}-${String(max + 1).padStart(4, '0')}`;
}

function inferProblemType(run: MonitoringRunResult, check: MonitoringCheckResult): ProblemType {
  const text = `${run.kind} ${check.id} ${check.name}`.toLowerCase();
  if (text.includes('audit') || text.includes('build') || text.includes('lint') || text.includes('type') || text.includes('test')) return 'SOFTWARE_REGRESSION';
  if (text.includes('data') || text.includes('candle') || text.includes('kline') || text.includes('binance')) return 'DATA_PROBLEM';
  if (text.includes('drift') || text.includes('regime')) return text.includes('regime') ? 'REGIME_CHANGE' : 'STATISTICAL_VARIABILITY';
  if (text.includes('backtest') || text.includes('simulation')) return 'SIMULATION_EXECUTION_PROBLEM';
  if (text.includes('eligibility') || text.includes('reason') || text.includes('performance')) return 'STRATEGY_FRAGILITY';
  return run.kind === 'update' ? 'SOFTWARE_REGRESSION' : 'STATISTICAL_VARIABILITY';
}

function affectedFromEvidence(evidence: unknown[], keys: string[]): string[] {
  const out = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (keys.includes(k) && typeof val === 'string') out.add(val);
      if (keys.includes(k) && Array.isArray(val)) val.filter((x): x is string => typeof x === 'string').forEach((x) => out.add(x));
      walk(val);
    }
  };
  walk(evidence);
  return [...out].sort();
}

function hypothesisText(problemType: ProblemType, check: MonitoringCheckResult): Pick<ImprovementHypothesis, 'hypothesis' | 'expectedMechanism' | 'proposedExperiment' | 'primaryMetrics' | 'safetyMetrics' | 'approvalCriteria' | 'rejectionCriteria' | 'risks' | 'overfittingRisk'> {
  const commonApproval = ['superar baseline previamente registrado', 'não deteriorar métricas de segurança', 'resultado consistente out-of-sample', 'passar em todos os testes de software'];
  const commonRejection = ['deteriorar drawdown/Sharpe/Sortino de forma material', 'não reproduzir fora da amostra', 'exigir faixa estreita de parâmetros', 'falhar testes automatizados'];
  if (problemType === 'SOFTWARE_REGRESSION') return {
    hypothesis: `Investigar e corrigir isoladamente a falha técnica observada em ${check.name} pode reduzir risco operacional sem alterar comportamento de trading.`,
    expectedMechanism: 'Remover regressão ou vulnerabilidade técnica aumenta confiabilidade do pipeline antes de merge/deploy.',
    proposedExperiment: 'Criar branch isolada, registrar baseline, alterar apenas a causa técnica da falha, rodar validate:update e comparar relatório de regressão.',
    primaryMetrics: ['validate:update OK', 'npm audit sem high quando aplicável', 'build/typecheck/lint/test OK'],
    safetyMetrics: ['sem alteração em sinais', 'sem alteração em pesos', 'sem alteração em thresholds', 'sem alteração em execução/paper/live'],
    approvalCriteria: commonApproval,
    rejectionCriteria: commonRejection,
    risks: ['mudança de dependência pode introduzir incompatibilidade', 'correção ampla pode mascarar regressão real'],
    overfittingRisk: 'LOW',
  };
  return {
    hypothesis: `Isolar e testar a causa de ${check.name} pode melhorar estabilidade sem promover mudança operacional direta.`,
    expectedMechanism: 'Um experimento controlado separa ruído estatístico de degradação real antes de qualquer mudança em estratégia/configuração.',
    proposedExperiment: 'Criar branch isolada, congelar baseline, rodar backtest com fees/slippage/funding, walk-forward e análise por ativo/timeframe/regime.',
    primaryMetrics: ['retorno líquido', 'expectativa por operação', 'profit factor', 'Sharpe', 'Sortino'],
    safetyMetrics: ['drawdown máximo', 'turnover', 'fees', 'slippage', 'funding', 'estabilidade out-of-sample', 'complexidade adicionada'],
    approvalCriteria: commonApproval,
    rejectionCriteria: commonRejection,
    risks: ['overfitting', 'amostra insuficiente', 'degradação em regimes não dominantes', 'complexidade adicional'],
    overfittingRisk: 'MEDIUM',
  };
}

function isBaselineOrDriftEvidence(check: MonitoringCheckResult): boolean {
  const id = check.id.toLowerCase();
  const limitations = check.limitations.join(' ').toLowerCase();
  if (limitations.includes('baseline inicial') || limitations.includes('experimental')) return false;
  return id.includes('baseline') || id.includes('drift');
}

function eligibleChecks(run: MonitoringRunResult): MonitoringCheckResult[] {
  return run.checks.filter((c) => c.status === 'CRITICAL' || (c.status === 'WARNING' && isBaselineOrDriftEvidence(c)));
}

export function deriveImprovementHypotheses(run: MonitoringRunResult, existing: ImprovementHypothesis[], sourceReport = 'current-run'): ContinuousImprovementDerivation {
  const now = run.generatedAt;
  const backlog = existing.map((h) => ({ ...h }));
  const newHypotheses: ImprovementHypothesis[] = [];
  const recurringHypotheses: ImprovementHypothesis[] = [];
  for (const check of eligibleChecks(run)) {
    const problemType = inferProblemType(run, check);
    const fp = fingerprint(run, check, problemType);
    const prior = backlog.find((h) => h.fingerprint === fp);
    if (prior) {
      prior.updatedAt = now;
      prior.observations += 1;
      prior.recurrence = 'RECURRING';
      prior.evidence = [...prior.evidence, ...check.evidence].slice(-10);
      recurringHypotheses.push(prior);
      continue;
    }
    const generated = hypothesisText(problemType, check);
    const h: ImprovementHypothesis = {
      id: nextId([...backlog, ...newHypotheses], now),
      fingerprint: fp,
      createdAt: now,
      updatedAt: now,
      sourceReport,
      observedProblem: check.name,
      evidence: check.evidence,
      period: run.period,
      recurrence: 'ISOLATED',
      observations: 1,
      affectedAssets: affectedFromEvidence(check.evidence, ['asset', 'pair', 'symbol']),
      affectedTimeframes: affectedFromEvidence(check.evidence, ['timeframe']),
      affectedFactors: affectedFromEvidence(check.evidence, ['factor', 'factors', 'reasonCode', 'reasonCodes']).concat(check.id.includes('confidence') ? ['confidence'] : []).sort(),
      affectedRegimes: affectedFromEvidence(check.evidence, ['regime', 'marketRegime']),
      problemType,
      priority: check.status === 'CRITICAL' ? 'HIGH' : 'MEDIUM',
      estimatedImpact: check.status === 'CRITICAL' ? 'Alto para confiabilidade técnica; confirmar por experimento.' : 'Potencial, depende de recorrência e validação out-of-sample.',
      estimatedEffort: problemType === 'SOFTWARE_REGRESSION' ? 'LOW' : 'MEDIUM',
      status: 'OBSERVED',
      finalDecision: null,
      testedInVersion: null,
      inSampleResult: null,
      outOfSampleResult: null,
      resultByRegime: null,
      conclusion: null,
      ...generated,
    };
    backlog.push(h);
    newHypotheses.push(h);
  }
  const awaitingApproval = backlog.filter((h) => h.status === 'OBSERVED' || h.status === 'UNDER_REVIEW' || h.status === 'APPROVED_FOR_EXPERIMENT');
  const inExperiment = backlog.filter((h) => h.status === 'IN_EXPERIMENT');
  const rejected = backlog.filter((h) => h.status === 'REJECTED');
  const implementedMonitoring = backlog.filter((h) => h.status === 'IMPLEMENTED' || h.status === 'MONITORING');
  const priorityRank = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;
  const prioritizedRecommendations = [...awaitingApproval].sort((a, b) => priorityRank[b.priority] - priorityRank[a.priority]).slice(0, 5);
  const summary = newHypotheses.length || recurringHypotheses.length || awaitingApproval.length || inExperiment.length || rejected.length || implementedMonitoring.length
    ? `${newHypotheses.length} nova(s), ${recurringHypotheses.length} recorrente(s), ${awaitingApproval.length} aguardando revisão/aprovação.`
    : NO_STATISTICALLY_SUPPORTED_HYPOTHESIS;
  return { summary, newHypotheses, recurringHypotheses, awaitingApproval, inExperiment, rejected, implementedMonitoring, prioritizedRecommendations, backlog };
}

export function toReportImprovement(summary: ContinuousImprovementDerivation): ContinuousImprovementSummary {
  const { backlog: _backlog, ...rest } = summary;
  return rest;
}
