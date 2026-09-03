// Índice de confiabilidade do robô — pontuação 0-100, calculada de dado
// real do banco (PilotActionLog, Signal), não é vibe nem enfeite. Existe
// pra dar uma resposta concreta e evolutiva pra "o robô já está pronto?"
// em vez de um sim/não binário, e pra virar uma linha do tempo real
// (ReliabilitySnapshot) de como a maturidade evolui semana a semana.
//
// IMPORTANTE, e isso nunca muda: isto mede maturidade TÉCNICA e
// OPERACIONAL — infraestrutura estável, amostra suficiente, ausência de
// divergência recente, estabilidade das decisões de estratégia. NÃO é, e
// nunca vai ser, uma recomendação de investimento. Um índice alto não
// significa "seguro investir X" — isso continua sendo decisão
// exclusivamente do usuário, fora do escopo deste cálculo.
//
// A pontuação PODE CAIR, não só subir — confiabilidade de verdade não é
// uma barra que só enche. Uma divergência nova, uma pausa recente, um gap
// de heartbeat, tudo isso reduz a pontuação até o sistema provar de novo
// que se estabilizou.
import { prisma } from './prisma';

export interface ReliabilityBreakdown {
  uptimeScore: number;             // 0-20 — ciclo rodando sem gap/erro
  sampleScore: number;             // 0-20 — volume de sinal real fechado
  strategyStabilityScore: number;  // 0-20 — tempo sem mexer em pause/resume
  stabilityScanScore: number;      // 0-20 — quantas rodadas semanais já aconteceram
  divergenceControlScore: number;  // 0-20 — tempo sem divergência nova
}

export interface ReliabilityResult {
  total: number;
  breakdown: ReliabilityBreakdown;
  computedAt: Date;
}

function scaleLinear(value: number, targetForFullScore: number, maxPoints: number): number {
  if (targetForFullScore <= 0) return maxPoints;
  return Math.max(0, Math.min(maxPoints, (value / targetForFullScore) * maxPoints));
}

async function daysSinceLastEvent(types: string[]): Promise<number> {
  const last = await prisma.pilotActionLog.findFirst({
    where: { type: { in: types } },
    orderBy: { createdAt: 'desc' },
  });
  if (!last) return 999; // nunca aconteceu — trata como "estável há muito tempo"
  return (Date.now() - last.createdAt.getTime()) / (24 * 60 * 60 * 1000);
}

export async function computeReliabilityScore(): Promise<ReliabilityResult> {
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // 1. Uptime (20 pts) — quantos gaps de heartbeat/erro de ciclo nos
  // últimos 14 dias. Zero eventos ruins = pontuação cheia; cada evento
  // desconta 2 pontos, satura em 0 aos 10 eventos.
  const badEvents14d = await prisma.pilotActionLog.count({
    where: { type: { in: ['HEARTBEAT_GAP', 'CYCLE_ERROR'] }, createdAt: { gte: fourteenDaysAgo } },
  });
  const uptimeScore = Math.max(0, 20 - badEvents14d * 2);

  // 2. Amostra ao vivo (20 pts) — total de sinais reais fechados
  // (WIN/LOSS). 200 trades fechados = pontuação cheia.
  const resolvedCount = await prisma.signal.count({ where: { source: 'live', status: { in: ['WIN', 'LOSS'] } } });
  const sampleScore = scaleLinear(resolvedCount, 200, 20);

  // 3. Estabilidade das decisões de estratégia (20 pts) — dias desde a
  // última mudança (pause/resume manual ou automático) sem reversão.
  // Recompensa ficar quieto, não mudar toda hora — uma correção recém-feita
  // reduz a pontuação até PROVAR estável de novo, não aumenta na hora.
  // 21 dias sem mudar nada = pontuação cheia.
  const daysSinceStrategyChange = await daysSinceLastEvent(['MANUAL_PAUSE', 'MANUAL_RESUME', 'AUTO_PAUSE']);
  const strategyStabilityScore = scaleLinear(daysSinceStrategyChange, 21, 20);

  // 4. Stability-scan (20 pts) — quantas rodadas semanais completas já
  // aconteceram. 4 rodadas (~1 mês) = pontuação cheia.
  const stabilityScanRuns = await prisma.pilotActionLog.count({ where: { type: 'STABILITY_SCAN' } });
  const stabilityScanScore = scaleLinear(stabilityScanRuns, 4, 20);

  // 5. Divergência sob controle (20 pts) — dias desde a última
  // divergência NOVA detectada. 14 dias sem divergência nova = pontuação
  // cheia.
  const daysSinceDivergence = await daysSinceLastEvent(['DIVERGENCE_DETECTED']);
  const divergenceControlScore = scaleLinear(daysSinceDivergence, 14, 20);

  const breakdown: ReliabilityBreakdown = {
    uptimeScore: Math.round(uptimeScore),
    sampleScore: Math.round(sampleScore),
    strategyStabilityScore: Math.round(strategyStabilityScore),
    stabilityScanScore: Math.round(stabilityScanScore),
    divergenceControlScore: Math.round(divergenceControlScore),
  };

  const total = Math.round(
    breakdown.uptimeScore +
    breakdown.sampleScore +
    breakdown.strategyStabilityScore +
    breakdown.stabilityScanScore +
    breakdown.divergenceControlScore
  );

  return { total, breakdown, computedAt: new Date() };
}

const RELIABILITY_SNAPSHOT_STATE_KEY = 'last_reliability_snapshot';
const MIN_HOURS_BETWEEN_SNAPSHOTS = 20; // no máximo 1x/dia, mesmo padrão dos outros checks

/**
 * Grava uma foto do índice atual no histórico, no máximo 1x por dia — é
 * isso que vira a linha do tempo "confiabilidade semana a semana" no
 * dashboard, em vez de só o número de agora.
 */
export async function recordReliabilitySnapshotIfDue(): Promise<{ ran: boolean; result: ReliabilityResult | null }> {
  const state = await prisma.systemState.findUnique({ where: { key: RELIABILITY_SNAPSHOT_STATE_KEY } });
  if (state) {
    const hoursSince = (Date.now() - new Date(state.value).getTime()) / (1000 * 60 * 60);
    if (hoursSince < MIN_HOURS_BETWEEN_SNAPSHOTS) return { ran: false, result: null };
  }

  const result = await computeReliabilityScore();

  await prisma.reliabilitySnapshot.create({
    data: {
      total: result.total,
      uptimeScore: result.breakdown.uptimeScore,
      sampleScore: result.breakdown.sampleScore,
      strategyStabilityScore: result.breakdown.strategyStabilityScore,
      stabilityScanScore: result.breakdown.stabilityScanScore,
      divergenceControlScore: result.breakdown.divergenceControlScore,
    },
  });

  await prisma.systemState.upsert({
    where: { key: RELIABILITY_SNAPSHOT_STATE_KEY },
    update: { value: new Date().toISOString() },
    create: { key: RELIABILITY_SNAPSHOT_STATE_KEY, value: new Date().toISOString() },
  });

  return { ran: true, result };
}
