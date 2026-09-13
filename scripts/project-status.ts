import { PrismaClient } from '@prisma/client';
import { getConfiguredExecutionMode } from '@/lib/execution-mode';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since6h = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const [
    shadowTotal,
    shadowRecent,
    paperRecent,
    pendingLive,
    pendingShadow,
    lastShadow,
    lastLive,
    lastConfig,
    states,
    breakers,
  ] = await Promise.all([
    prisma.signal.count({ where: { source: { startsWith: 'shadow_v' } } }),
    prisma.signal.count({ where: { source: { startsWith: 'shadow_v' }, createdAt: { gte: since24h } } }),
    prisma.signal.count({ where: { source: 'live', createdAt: { gte: since24h } } }),
    prisma.signal.count({ where: { source: 'live', status: 'PENDENTE' } }),
    prisma.signal.count({ where: { source: { startsWith: 'shadow_v' }, status: 'PENDENTE' } }),
    prisma.signal.findFirst({
      where: { source: { startsWith: 'shadow_v' } },
      orderBy: { createdAt: 'desc' },
      select: { strategyId: true, strategyName: true, pair: true, direction: true, timeframe: true, source: true, marketRegime: true, confidence: true, createdAt: true },
    }),
    prisma.signal.findFirst({
      where: { source: 'live' },
      orderBy: { createdAt: 'desc' },
      select: { strategyId: true, strategyName: true, pair: true, direction: true, timeframe: true, source: true, marketRegime: true, confidence: true, createdAt: true },
    }),
    prisma.configVersion.findFirst({ orderBy: { version: 'desc' }, select: { version: true, reason: true, createdAt: true } }),
    prisma.systemState.findMany({ orderBy: { updatedAt: 'desc' }, take: 20 }),
    prisma.riskCircuitBreaker.findMany({ where: { tripped: true }, select: { key: true, reason: true, metricValue: true, threshold: true, trippedAt: true } }),
  ]);

  console.log(JSON.stringify({
    now,
    executionMode: getConfiguredExecutionMode(),
    shadowTotal,
    shadowRecent24h: shadowRecent,
    paperLiveRecent24h: paperRecent,
    pendingLive,
    pendingShadow,
    lastShadow,
    lastLive,
    lastConfig,
    systemStates: states.map(s => ({ key: s.key, value: s.value, updatedAt: s.updatedAt })),
    activeCircuitBreakers: breakers,
  }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
