export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const HEARTBEAT_STATE_KEY = 'last_cycle_heartbeat';
const HEARTBEAT_GAP_MULTIPLIER = 3;

// Endpoint público e mínimo — de propósito sem autenticação e sem dado
// sensível, pra dar pra usar com um serviço externo de uptime (ping
// simples) sem precisar de token. Pra detalhe completo (log de eventos,
// contagem de pausas, etc.), ver /api/pilot/status (autenticado).
export async function GET() {
  try {
    const intervalMinutes = Math.max(1, parseInt(process.env.SCHEDULER_INTERVAL_MINUTES ?? '15', 10) || 15);
    const heartbeat = await prisma.systemState.findUnique({ where: { key: HEARTBEAT_STATE_KEY } });

    if (!heartbeat) {
      return NextResponse.json({ ok: false, reason: 'Agendador nunca rodou um ciclo ainda' }, { status: 503 });
    }

    const minutesSince = (Date.now() - new Date(heartbeat.value).getTime()) / (1000 * 60);
    const threshold = intervalMinutes * HEARTBEAT_GAP_MULTIPLIER;
    const ok = minutesSince <= threshold;

    return NextResponse.json(
      { ok, lastCycleAt: heartbeat.value, minutesSinceLastCycle: Math.round(minutesSince), staleThresholdMinutes: threshold },
      { status: ok ? 200 : 503 }
    );
  } catch (error: any) {
    return NextResponse.json({ ok: false, reason: 'Erro ao checar saúde' }, { status: 500 });
  }
}
