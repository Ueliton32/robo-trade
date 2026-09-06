// Painel de status consolidado do robô (Fase 11, 05/09/2026) — junta em
// UM lugar as informações que hoje só dá pra ver rodando comandos
// separados (npm run risk:reset -- --list, npm run ml:model -- --list,
// npm run weights:recompute -- --dry-run) ou lendo
// scripts/check-live-config.ts. Função PURA de leitura — nunca muda
// nada, só relata o que já está gravado no banco.
//
// Usado em dois lugares:
//   - scripts/report-status.ts — comando CLI sob demanda, visão completa
//     (inclui detalhe por usuário: versão de config atual de cada um).
//   - lib/weekly-digest.ts — resumo automático semanal, versão resumida
//     (só agregados globais — a mensagem semanal já é a mesma pra todos
//     os inscritos, não faz sentido detalhar por usuário nela).
import { prisma } from './prisma';
import { STRATEGY_DEFS } from './strategies';
import { BREAKER_KEYS } from './circuit-breakers';
import { getConfiguredExecutionMode } from './execution-mode';

export interface BreakerStatusRow {
  key: string;
  tripped: boolean;
  trippedAt: Date | null;
  reason: string | null;
}

export interface WeightStatusRow {
  strategyId: number;
  strategyName: string;
  weight: number;
  neutral: boolean;
  sampleSize: number;
  computedAt: Date | null;
}

export interface ModelStatusRow {
  strategyId: number;
  strategyName: string;
  version: number;
  testAUC: number | null;
  testAccuracy: number | null;
  baselineWinRate: number | null;
  trainedAt: Date;
}

export interface RobotStatusReport {
  executionMode: string;
  breakers: BreakerStatusRow[];
  breakersTrippedCount: number;
  weights: WeightStatusRow[];
  weightsComputedAtLeastOnce: boolean;
  models: ModelStatusRow[];
  totalStrategies: number;
}

export async function buildRobotStatusReport(): Promise<RobotStatusReport> {
  const executionMode = getConfiguredExecutionMode();

  const breakerRows = await prisma.riskCircuitBreaker.findMany();
  const byKey = new Map(breakerRows.map((r) => [r.key, r]));
  const breakers: BreakerStatusRow[] = BREAKER_KEYS.map((key) => {
    const row = byKey.get(key);
    return { key, tripped: !!row?.tripped, trippedAt: row?.trippedAt ?? null, reason: row?.reason ?? null };
  });
  const breakersTrippedCount = breakers.filter((b) => b.tripped).length;

  // Mesmo padrão de dedupe em memória de getLatestStrategyWeights() —
  // pega um lote recente e fica só com a linha mais nova por estratégia.
  const weightRows = await prisma.strategyWeight.findMany({
    where: { strategyId: { in: STRATEGY_DEFS.map((s) => s.id) } },
    orderBy: { computedAt: 'desc' },
    take: STRATEGY_DEFS.length * 5,
  });
  const seenW = new Set<number>();
  const latestWeightByStrategy = new Map<number, (typeof weightRows)[number]>();
  for (const row of weightRows) {
    if (seenW.has(row.strategyId)) continue;
    seenW.add(row.strategyId);
    latestWeightByStrategy.set(row.strategyId, row);
  }

  const weights: WeightStatusRow[] = STRATEGY_DEFS.map((s) => {
    const row = latestWeightByStrategy.get(s.id);
    return row
      ? { strategyId: s.id, strategyName: s.name, weight: row.weight, neutral: row.neutral, sampleSize: row.sampleSize, computedAt: row.computedAt }
      : { strategyId: s.id, strategyName: s.name, weight: 1.0, neutral: true, sampleSize: 0, computedAt: null };
  });
  const weightsComputedAtLeastOnce = weightRows.length > 0;

  // Schema/lib/ml-model.ts garantem no máximo 1 modelo ativo por
  // estratégia (trainAndSaveModel desativa o anterior ao ativar um novo).
  const modelRows = await prisma.mLModel.findMany({ where: { active: true } });
  const models: ModelStatusRow[] = modelRows
    .map((r) => ({
      strategyId: r.strategyId,
      strategyName: r.strategyName,
      version: r.version,
      testAUC: r.testAUC,
      testAccuracy: r.testAccuracy,
      baselineWinRate: r.baselineWinRate,
      trainedAt: r.trainedAt,
    }))
    .sort((a, b) => a.strategyId - b.strategyId);

  return {
    executionMode,
    breakers,
    breakersTrippedCount,
    weights,
    weightsComputedAtLeastOnce,
    models,
    totalStrategies: STRATEGY_DEFS.length,
  };
}

/**
 * Formato texto completo (usado por scripts/report-status.ts). Uma linha
 * por informação, pensado pra terminal — sem HTML, sem truncar nada.
 */
export function formatStatusReportText(r: RobotStatusReport): string[] {
  const lines: string[] = [];

  lines.push(`Modo de execução: ${r.executionMode}`);
  lines.push('');

  lines.push(`Circuit breakers de risco (${r.breakersTrippedCount} disparado(s) de ${r.breakers.length}):`);
  for (const b of r.breakers) {
    lines.push(
      b.tripped
        ? `  ${b.key.padEnd(14)} — 🛑 DISPARADO em ${b.trippedAt?.toISOString() ?? '?'} — ${b.reason ?? '(sem motivo registrado)'}`
        : `  ${b.key.padEnd(14)} — OK`
    );
  }
  lines.push('');

  lines.push(
    `Pesos por estratégia (Fase 7)${r.weightsComputedAtLeastOnce ? '' : ' — nunca calculado ainda, todos neutros'}:`
  );
  for (const w of r.weights) {
    const computed = w.computedAt ? `, calculado em ${w.computedAt.toISOString()}` : '';
    lines.push(
      `  #${w.strategyId} ${w.strategyName.padEnd(30)} peso=${w.weight.toFixed(3)}${w.neutral ? ' (neutro)' : ''} — amostra=${w.sampleSize}${computed}`
    );
  }
  lines.push('');

  lines.push(`Modelos ML ativos (Fase 6): ${r.models.length} de ${r.totalStrategies} estratégia(s)`);
  if (r.models.length === 0) {
    lines.push('  Nenhum modelo ativo. Fase 6 rodou 2 testes reais (estratégia fraca e a mais forte do projeto) — ambos com');
    lines.push('  AUC≈0.55 (quase aleatório) — nenhum foi ativado, por decisão explícita de registrar como achado negativo');
    lines.push('  em vez de forçar mais complexidade atrás de um resultado melhor. Ver comentário "ACHADO" em lib/ml-features.ts.');
  } else {
    for (const m of r.models) {
      lines.push(
        `  #${m.strategyId} ${m.strategyName.padEnd(30)} v${m.version} — AUC=${m.testAUC?.toFixed(3) ?? 'n/d'}, acc=${m.testAccuracy !== null ? (m.testAccuracy * 100).toFixed(1) + '%' : 'n/d'}, baseline WR=${m.baselineWinRate?.toFixed(1) ?? 'n/d'}%, treinado em ${m.trainedAt.toISOString()}`
      );
    }
  }

  return lines;
}

/**
 * Resumo compacto (usado por lib/weekly-digest.ts) — só agregados
 * globais, nunca detalhe por usuário (a mensagem semanal é a mesma pra
 * todos os inscritos). 4 linhas, mesmo espírito do resto do resumo
 * semanal: números, sem prometer nada sobre performance futura.
 */
export function formatStatusReportDigestLines(r: RobotStatusReport): string[] {
  const adjustedWeights = r.weights.filter((w) => !w.neutral).length;
  return [
    `Modo de execução: ${r.executionMode}`,
    r.breakersTrippedCount > 0
      ? `⚠️ ${r.breakersTrippedCount} circuit breaker(s) disparado(s) — geração de sinal pausada até reset manual`
      : `Circuit breakers: todos OK`,
    r.weightsComputedAtLeastOnce
      ? `Pesos por estratégia: ${adjustedWeights} ajustada(s), ${r.weights.length - adjustedWeights} neutra(s)`
      : `Pesos por estratégia: ainda não calculados (todos neutros)`,
    `Modelos ML ativos: ${r.models.length} de ${r.totalStrategies}`,
  ];
}

export function formatStatusReportDigestHtml(r: RobotStatusReport): string {
  const lines = formatStatusReportDigestLines(r);
  return `<li>${lines.join('</li><li>')}</li>`;
}
