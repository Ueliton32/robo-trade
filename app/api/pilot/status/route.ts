export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';
import { getRecentPilotEvents } from '@/lib/pilot-log';
import { computeCorrelationExposure } from '@/lib/correlation-exposure';

const HEARTBEAT_STATE_KEY = 'last_cycle_heartbeat';
const DIVERGENCE_CHECK_STATE_KEY = 'last_divergence_check';
const STABILITY_SCAN_STATE_KEY = 'last_stability_scan';
const WEEKLY_DIGEST_STATE_KEY = 'last_weekly_digest';
const CONSECUTIVE_FAILURES_STATE_KEY = 'consecutive_cycle_failures';
const HEARTBEAT_GAP_MULTIPLIER = 3;

// Painel de saúde completo pro dashboard — heartbeat do agendador, quando
// cada checagem automática rodou pela última vez, quantas combinações
// estão pausadas agora, e as últimas linhas da trilha de auditoria
// (PilotActionLog). Requer login (diferente de /api/health, que é público
// e mínimo, pensado pra ping externo).
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const intervalMinutes = Math.max(1, parseInt(process.env.SCHEDULER_INTERVAL_MINUTES ?? '15', 10) || 15);

    const [heartbeat, lastDivergence, lastStability, lastDigest, failures, pausedCount, recentEvents, exposure] = await Promise.all([
      prisma.systemState.findUnique({ where: { key: HEARTBEAT_STATE_KEY } }),
      prisma.systemState.findUnique({ where: { key: DIVERGENCE_CHECK_STATE_KEY } }),
      prisma.systemState.findUnique({ where: { key: STABILITY_SCAN_STATE_KEY } }),
      prisma.systemState.findUnique({ where: { key: WEEKLY_DIGEST_STATE_KEY } }),
      prisma.systemState.findUnique({ where: { key: CONSECUTIVE_FAILURES_STATE_KEY } }),
      prisma.divergenceStreak.count({ where: { paused: true } }),
      getRecentPilotEvents(20),
      computeCorrelationExposure().catch(() => null),
    ]);

    const minutesSinceHeartbeat = heartbeat ? (Date.now() - new Date(heartbeat.value).getTime()) / (1000 * 60) : null;
    const staleThreshold = intervalMinutes * HEARTBEAT_GAP_MULTIPLIER;
    const alive = minutesSinceHeartbeat !== null && minutesSinceHeartbeat <= staleThreshold;

    return NextResponse.json({
      alive,
      lastCycleAt: heartbeat?.value ?? null,
      minutesSinceLastCycle: minutesSinceHeartbeat !== null ? Math.round(minutesSinceHeartbeat) : null,
      consecutiveFailures: parseInt(failures?.value ?? '0', 10) || 0,
      lastDivergenceCheckAt: lastDivergence?.value ?? null,
      lastStabilityScanAt: lastStability?.value ?? null,
      lastWeeklyDigestAt: lastDigest?.value ?? null,
      pausedCombos: pausedCount,
      recentEvents,
      correlationExposure: exposure,
    });
  } catch (error: any) {
    console.error('Pilot status error:', error);
    return NextResponse.json({ error: 'Erro ao buscar status do piloto' }, { status: 500 });
  }
}
