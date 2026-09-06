// Trilha de auditoria do piloto automático — ver PilotActionLog em
// prisma/schema.prisma pro racional completo. Usado por
// lib/divergence-check.ts, lib/stability-engine.ts, lib/weekly-digest.ts,
// scripts/scheduler.ts e as rotas de pause/resume manual.
import { prisma } from './prisma';

export type PilotEventType =
  | 'CYCLE_ERROR'
  | 'CYCLE_RECOVERED'
  | 'DIVERGENCE_DETECTED'
  | 'AUTO_PAUSE'
  | 'MANUAL_PAUSE'
  | 'MANUAL_RESUME'
  | 'STABILITY_SCAN'
  | 'HEARTBEAT_GAP'
  | 'WEEKLY_DIGEST'
  | 'CORRELATION_EXPOSURE'
  | 'CIRCUIT_BREAKER_TRIPPED'
  | 'CIRCUIT_BREAKER_RESET';

export async function logPilotEvent(
  type: PilotEventType,
  message: string,
  extra?: { strategyId?: number; pair?: string; timeframe?: string }
): Promise<void> {
  try {
    await prisma.pilotActionLog.create({
      data: {
        type,
        message,
        strategyId: extra?.strategyId ?? null,
        pair: extra?.pair ?? null,
        timeframe: extra?.timeframe ?? null,
      },
    });
  } catch (e: any) {
    // O log em si nunca deve derrubar quem chamou — se falhar, só avisa no
    // console em vez de propagar o erro pro ciclo principal.
    console.error('[pilot-log] Falha ao gravar evento:', e?.message);
  }
}

export async function getRecentPilotEvents(limit: number = 50) {
  return prisma.pilotActionLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
}
