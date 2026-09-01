import { prisma } from '@/lib/prisma';
import { getKlines, Kline } from '@/lib/binance';
import { STRATEGY_DEFS } from '@/lib/strategies';
import { computeMetrics, TradeLike } from '@/lib/metrics';

// Sinais mais antigos que isso sem bater em alvo nem stop são marcados como EXPIRADO
// e ficam de fora das estatísticas (não contam nem como WIN nem como LOSS).
const MAX_SIGNAL_AGE_DAYS = 10;

// Depois de bater o alvo 1, por quantos dias ainda vale a pena checar se o
// preço também chegou no alvo 2 (só pra fins de notificação/informação).
const TARGET2_LOOKAHEAD_DAYS = 5;

/**
 * Verifica sinais PENDENTE (apenas os reais, source = "live") contra o histórico
 * real de candles da Binance desde a criação do sinal, e fecha os que já
 * bateram no alvo 1 (WIN) ou no stop loss (LOSS). Isso é o que alimenta as
 * estatísticas reais — antes, esses números eram fixos/fictícios no seed.
 *
 * Retorna os sinais que fecharam agora (com o outcome), pra quem chamar essa
 * função poder mandar notificação de "alvo atingido" / "stop atingido".
 */
export async function closeTriggeredSignals(): Promise<{
  closed: number;
  expired: number;
  closedSignals: Array<{ signal: any; outcome: 'WIN' | 'LOSS' }>;
}> {
  const pending = await prisma.signal.findMany({
    where: { status: 'PENDENTE', source: 'live' },
  });

  let closed = 0;
  let expired = 0;
  const closedSignals: Array<{ signal: any; outcome: 'WIN' | 'LOSS' }> = [];

  // Mesmo teto de concorrência de lib/analysis-engine.ts (generateSignals) —
  // sequencial aqui também estourava o limite de tempo de função serverless
  // assim que havia sinal pendente suficiente pra checar.
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const signal = pending[cursor++];
      const ageMs = Date.now() - new Date(signal.createdAt).getTime();
      const ageDays = ageMs / (1000 * 60 * 60 * 24);

      // Busca candles de 15m desde a criação do sinal para checar, em ordem
      // cronológica, se o stop ou o alvo foi tocado primeiro.
      const klines = await getKlinesSince(signal.pair, signal.createdAt);
      const outcome = evaluateOutcome(signal, klines);

      if (outcome) {
        const updated = await prisma.signal.update({
          where: { id: signal.id },
          data: {
            status: outcome.status,
            result: outcome.status,
            pnlPercent: outcome.pnlPercent,
            closedAt: outcome.closedAt,
          },
        });
        closed++;
        closedSignals.push({ signal: updated, outcome: outcome.status });
        continue;
      }

      if (ageDays > MAX_SIGNAL_AGE_DAYS) {
        await prisma.signal.update({
          where: { id: signal.id },
          data: { status: 'EXPIRADO', result: 'EXPIRADO', closedAt: new Date() },
        });
        expired++;
      }
    }
  }

  const CLOSE_SIGNALS_CONCURRENCY = 6;
  await Promise.all(
    Array.from({ length: Math.min(CLOSE_SIGNALS_CONCURRENCY, pending.length) }, () => worker())
  );

  return { closed, expired, closedSignals };
}

/**
 * Alvo 2 é só informativo — não muda WIN/LOSS nem as estatísticas (que já
 * fecham no alvo 1). Isso apenas checa, pros sinais que já foram WIN, se o
 * preço seguiu e também bateu no alvo 2, pra mandar uma notificação extra.
 */
export async function checkTarget2Progress(): Promise<{ signal: any }[]> {
  const cutoff = new Date(Date.now() - TARGET2_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.signal.findMany({
    where: {
      status: 'WIN',
      source: 'live',
      target2Reached: false,
      closedAt: { gte: cutoff },
    },
  });

  const reached: { signal: any }[] = [];

  for (const signal of candidates) {
    if (!signal.closedAt) continue;
    const klines = await getKlinesSince(signal.pair, signal.closedAt);
    const isLong = signal.direction === 'LONG';
    const hitTarget2 = klines.some((k) =>
      isLong ? k.high >= signal.target2 : k.low <= signal.target2
    );

    if (hitTarget2) {
      const updated = await prisma.signal.update({
        where: { id: signal.id },
        data: { target2Reached: true },
      });
      reached.push({ signal: updated });
    }
  }

  return reached;
}

async function getKlinesSince(pair: string, since: Date): Promise<Kline[]> {
  // A Binance limita 1000 candles por chamada; 15m cobre ~10 dias com folga.
  const all = await getKlines(pair, '15m', 1000);
  const sinceTime = new Date(since).getTime();
  return all.filter((k) => k.closeTime >= sinceTime);
}

function evaluateOutcome(
  signal: { direction: string; entryPrice: number; target1: number; stopLoss: number },
  klines: Kline[]
): { status: 'WIN' | 'LOSS'; pnlPercent: number; closedAt: Date } | null {
  const isLong = signal.direction === 'LONG';

  for (const k of klines) {
    const hitStop = isLong ? k.low <= signal.stopLoss : k.high >= signal.stopLoss;
    const hitTarget = isLong ? k.high >= signal.target1 : k.low <= signal.target1;

    // Se os dois níveis foram tocados no mesmo candle, assume o cenário mais
    // conservador (stop primeiro) — não dá pra saber a ordem intra-candle.
    if (hitStop) {
      const pnlPercent = isLong
        ? ((signal.stopLoss - signal.entryPrice) / signal.entryPrice) * 100
        : ((signal.entryPrice - signal.stopLoss) / signal.entryPrice) * 100;
      return { status: 'LOSS', pnlPercent, closedAt: new Date(k.closeTime) };
    }
    if (hitTarget) {
      const pnlPercent = isLong
        ? ((signal.target1 - signal.entryPrice) / signal.entryPrice) * 100
        : ((signal.entryPrice - signal.target1) / signal.entryPrice) * 100;
      return { status: 'WIN', pnlPercent, closedAt: new Date(k.closeTime) };
    }
  }
  return null;
}


/**
 * Recalcula StrategyStats a partir SOMENTE de sinais reais (source = "live")
 * já fechados (WIN ou LOSS). Estratégias sem trades fechados ficam com
 * métricas zeradas — nada de números inventados. Usa o mesmo computeMetrics
 * do backtest (lib/metrics.ts), pra garantir que os números são comparáveis.
 */
export async function recalculateStrategyStats(): Promise<void> {
  for (const strat of STRATEGY_DEFS) {
    const closedSignals = await prisma.signal.findMany({
      where: { strategyId: strat.id, source: 'live', status: { in: ['WIN', 'LOSS'] } },
      orderBy: { closedAt: 'asc' },
    });

    const metrics = computeMetrics(closedSignals as TradeLike[]);

    await prisma.strategyStats.upsert({
      where: { strategyId: strat.id },
      update: {
        strategyName: strat.name,
        ...metrics,
      },
      create: {
        strategyId: strat.id,
        strategyName: strat.name,
        description: STRATEGY_DESCRIPTIONS[strat.id] ?? '',
        ...metrics,
      },
    });
  }
}

export const STRATEGY_DESCRIPTIONS: Record<number, string> = {
  1: 'Identifica consolidações (ranges) e alerta quando o preço rompe com volume acima da média.',
  2: 'Monitora tendência com Price Action e aguarda retração até a EMA20 com confirmação de rejeição.',
  3: 'Identifica áreas de liquidez (máximas/mínimas relevantes) e detecta fakeouts com volume spike.',
  4: 'Monitora Funding Rate em tempo real e alerta quando está extremamente positivo ou negativo.',
  5: 'Monitora movimentos bruscos de preço para detectar possíveis liquidações em massa e reversão.',
  6: 'Calcula ATR para identificar squeezes de volatilidade e alerta para direção provável de breakout.',
};
