import { prisma } from '@/lib/prisma';
import { STRATEGY_DEFS, SignalData } from '@/lib/strategies';
import { MONITORED_PAIRS, getKlines } from '@/lib/binance';
import { sendSignalEmail, sendOutcomeEmail } from '@/lib/signal-email';
import { sendSignalTelegram, sendOutcomeTelegram } from '@/lib/signal-telegram';
import { classifyRegime } from '@/lib/regime';
import { regimeAllowsStrategy } from '@/lib/radar-context';

// Estratégias que já validamos com o filtro de regime (via lib/radar-context-backtest.ts)
// o suficiente pra rodar com esse filtro também ao vivo, não só em backtest.
// Só a Pullback na EMA20 até agora — melhorou ou manteve o resultado em
// 3 de 3 moedas testadas (ETH, SOL, ADA) em 11/08/2026.
const REGIME_GATED_STRATEGIES_LIVE: number[] = [2];

/**
 * Pra estratégias na lista acima, só libera o sinal se o regime de
 * mercado, nesse exato momento, for compatível com o contexto que
 * validamos pra ela (ver lib/radar-context.ts). Estratégias fora da lista
 * passam direto, sem filtro nenhum — comportamento inalterado.
 */
async function passesLiveRegimeGate(strategyId: number, pair: string): Promise<boolean> {
  if (!REGIME_GATED_STRATEGIES_LIVE.includes(strategyId)) return true;

  try {
    const regimeKlines = await getKlines(pair, '1h', 300);
    const classification = classifyRegime(regimeKlines);
    if (!classification) return false; // dado insuficiente — conservador, não libera
    return regimeAllowsStrategy(classification, strategyId);
  } catch (e: any) {
    console.error(`Erro ao checar regime pra ${pair}:`, e?.message);
    return false; // erro de dado — conservador, não libera
  }
}

// Par → estratégia → quais timeframes dessa estratégia rodam pra esse par.
export type PairStrategyPlan = Record<string, Record<number, string[]>>;

/**
 * Monta o plano completo pra um usuário: pares sem override em
 * pairStrategies usam a lista global enabledStrategies; pares com override
 * usam só as estratégias marcadas especificamente pra eles. Timeframes
 * seguem os padrões de cada estratégia, a menos que pairStrategyTimeframes
 * restrinja pra um (par, estratégia) específico.
 */
export function buildPairStrategyPlan(settings: {
  monitoredPairs?: string[] | null;
  enabledStrategies?: number[] | null;
  pairStrategies?: unknown;
  pairStrategyTimeframes?: unknown;
} | null): PairStrategyPlan {
  const pairs = settings?.monitoredPairs?.length ? settings.monitoredPairs : MONITORED_PAIRS;
  const defaultStrats = settings?.enabledStrategies?.length ? settings.enabledStrategies : [1, 2, 3, 4, 5, 6];
  const strategyOverrides = (settings?.pairStrategies ?? {}) as Record<string, number[]>;
  const timeframeOverrides = (settings?.pairStrategyTimeframes ?? {}) as Record<string, Record<string, string[]>>;

  const plan: PairStrategyPlan = {};
  for (const pair of pairs) {
    const enabledIds = strategyOverrides?.[pair]?.length ? strategyOverrides[pair] : defaultStrats;
    plan[pair] = {};
    for (const id of enabledIds) {
      const strat = STRATEGY_DEFS.find((s) => s.id === id);
      if (!strat) continue;
      const tfOverride = timeframeOverrides?.[pair]?.[String(id)];
      const timeframes = tfOverride?.length ? tfOverride.filter((tf) => strat.timeframes.includes(tf)) : strat.timeframes;
      if (timeframes.length) plan[pair][id] = timeframes;
    }
  }
  return plan;
}

/**
 * Roda cada estratégia contra cada par do plano, só nos timeframes
 * permitidos pra aquela combinação. Retorna os novos sinais encontrados
 * (ainda não salvos no banco).
 */
export async function generateSignals(plan: PairStrategyPlan): Promise<SignalData[]> {
  const newSignals: SignalData[] = [];

  // Combinações pausadas automaticamente por divergência persistente
  // (ver lib/divergence-check.ts) não geram sinal novo, mesmo que o
  // usuário ainda tenha a estratégia/par habilitados em Configurações.
  // Import dinâmico pra evitar dependência circular (divergence-check.ts
  // também importa deste arquivo).
  const { getPausedComboKeys } = await import('@/lib/divergence-check');
  const pausedCombos = await getPausedComboKeys().catch(() => new Set<string>());

  for (const [pair, strategyTimeframes] of Object.entries(plan)) {
    for (const [strategyIdStr, timeframes] of Object.entries(strategyTimeframes)) {
      const strategyId = Number(strategyIdStr);
      const strat = STRATEGY_DEFS.find((s) => s.id === strategyId);
      if (!strat) continue;

      for (const tf of timeframes) {
        if (pausedCombos.has(`${strategyId}|${pair}|${tf}`)) continue;

        try {
          let signal: SignalData | null = null;
          if (strat.id === 4) {
            signal = await (strat.analyze as any)(pair);
          } else {
            signal = await (strat.analyze as any)(pair, tf);
          }
          if (signal && (await passesLiveRegimeGate(strategyId, pair))) newSignals.push(signal);
        } catch (e: any) {
          console.error(`Strategy ${strat.id} error for ${pair}/${tf}:`, e?.message);
        }
      }
    }
  }

  return newSignals;
}

/**
 * Salva os sinais novos, descartando duplicados (mesma estratégia/par/direção
 * nas últimas 4h). Retorna os que foram efetivamente gravados.
 */
export async function saveNewSignals(newSignals: SignalData[]) {
  const saved = [];
  for (const sig of newSignals) {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const dup = await prisma.signal.findFirst({
      where: {
        strategyId: sig.strategyId,
        pair: sig.pair,
        direction: sig.direction,
        createdAt: { gte: fourHoursAgo },
      },
    });
    if (dup) continue;

    const created = await prisma.signal.create({ data: sig });
    saved.push(created);
  }
  return saved;
}

/**
 * Envia e-mail e/ou Telegram para todo usuário com alertas ligados que
 * tenha essa estratégia marcada. Sinais não têm dono (são globais no app),
 * então a notificação é "quem quiser saber, se inscreve".
 */
export async function notifySubscribedUsers(savedSignals: any[]): Promise<void> {
  if (!savedSignals.length) return;

  const subscribers = await prisma.userSettings.findMany({
    where: {
      OR: [
        { emailAlerts: true, alertEmail: { not: null } },
        { telegramAlerts: true, telegramChatId: { not: null } },
      ],
    },
  });
  if (!subscribers.length) return;

  for (const sig of savedSignals) {
    for (const sub of subscribers) {
      if (sub.emailAlerts && sub.alertEmail && sub.emailStrategies?.includes(sig.strategyId)) {
        try {
          await sendSignalEmail(sig, sub.alertEmail);
        } catch (e: any) {
          console.error('Email error:', e?.message);
        }
      }
      if (sub.telegramAlerts && sub.telegramChatId && sub.telegramStrategies?.includes(sig.strategyId)) {
        try {
          await sendSignalTelegram(sig, sub.telegramChatId);
        } catch (e: any) {
          console.error('Telegram error:', e?.message);
        }
      }
    }
  }
}

/**
 * Notifica quando um sinal fecha (alvo 1 = WIN, stop = LOSS) ou quando um
 * sinal já vencido também alcança o alvo 2 (bônus informativo). Usa a
 * mesma lista de inscritos e as mesmas estratégias marcadas para alerta
 * de "novo sinal" — quem quer saber que o sinal nasceu também costuma
 * querer saber como ele terminou.
 */
export async function notifySignalOutcomes(
  closedSignals: Array<{ signal: any; outcome: 'WIN' | 'LOSS' }>,
  target2Signals: Array<{ signal: any }>
): Promise<void> {
  if (!closedSignals.length && !target2Signals.length) return;

  const subscribers = await prisma.userSettings.findMany({
    where: {
      OR: [
        { emailAlerts: true, alertEmail: { not: null } },
        { telegramAlerts: true, telegramChatId: { not: null } },
      ],
    },
  });
  if (!subscribers.length) return;

  for (const { signal, outcome } of closedSignals) {
    for (const sub of subscribers) {
      if (sub.emailAlerts && sub.alertEmail && sub.emailStrategies?.includes(signal.strategyId)) {
        try { await sendOutcomeEmail(signal, sub.alertEmail, outcome); } catch (e: any) { console.error('Email outcome error:', e?.message); }
      }
      if (sub.telegramAlerts && sub.telegramChatId && sub.telegramStrategies?.includes(signal.strategyId)) {
        try { await sendOutcomeTelegram(signal, sub.telegramChatId, outcome); } catch (e: any) { console.error('Telegram outcome error:', e?.message); }
      }
    }
  }

  for (const { signal } of target2Signals) {
    for (const sub of subscribers) {
      if (sub.emailAlerts && sub.alertEmail && sub.emailStrategies?.includes(signal.strategyId)) {
        try { await sendOutcomeEmail(signal, sub.alertEmail, 'TARGET2'); } catch (e: any) { console.error('Email outcome error:', e?.message); }
      }
      if (sub.telegramAlerts && sub.telegramChatId && sub.telegramStrategies?.includes(signal.strategyId)) {
        try { await sendOutcomeTelegram(signal, sub.telegramChatId, 'TARGET2'); } catch (e: any) { console.error('Telegram outcome error:', e?.message); }
      }
    }
  }
}

/**
 * Plano completo pra uma rodada sem usuário logado (ex: o agendador em
 * background): mescla (união) o que cada usuário configurou — inclusive
 * os timeframes restritos por par. Se ninguém configurou nada ainda, usa
 * os defaults globais com todas as estratégias e seus timeframes padrão.
 */
export async function getGlobalPairStrategyPlan(): Promise<PairStrategyPlan> {
  const allSettings = await prisma.userSettings.findMany();

  if (!allSettings.length) {
    const plan: PairStrategyPlan = {};
    for (const p of MONITORED_PAIRS) {
      plan[p] = {};
      for (const strat of STRATEGY_DEFS) plan[p][strat.id] = strat.timeframes;
    }
    return plan;
  }

  const merged: Record<string, Record<number, Set<string>>> = {};
  for (const s of allSettings) {
    const userPlan = buildPairStrategyPlan(s as any);
    for (const [pair, strategyTimeframes] of Object.entries(userPlan)) {
      if (!merged[pair]) merged[pair] = {};
      for (const [idStr, tfs] of Object.entries(strategyTimeframes)) {
        const id = Number(idStr);
        if (!merged[pair][id]) merged[pair][id] = new Set();
        tfs.forEach((tf) => merged[pair][id].add(tf));
      }
    }
  }

  const result: PairStrategyPlan = {};
  for (const [pair, strategyTimeframes] of Object.entries(merged)) {
    result[pair] = {};
    for (const [idStr, tfSet] of Object.entries(strategyTimeframes)) {
      result[pair][Number(idStr)] = Array.from(tfSet);
    }
  }
  return result;
}
