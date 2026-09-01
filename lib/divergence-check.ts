import { prisma } from './prisma';
import { STRATEGY_DEFS } from './strategies';
import { buildPairStrategyPlan, PairStrategyPlan } from './analysis-engine';
import { computeMetrics, TradeLike } from './metrics';
import { logPilotEvent } from './pilot-log';

const BACKTEST_MONTHS = 3; // do scan original (backtest-scan.ts)
const CONTEXT_MONTHS = 2;  // do scan de contexto (radar-context-scan.ts)
const MIN_LIVE_TRADES = 10;
const PF_GAP_THRESHOLD = -0.5;

// Piso absoluto usado SÓ quando não existe baseline de backtest pra
// comparar — caso de par adicionado via Configurações que nunca passou
// pelo backtest-scan/radar-context-scan (ex: fora da lista curada de 21
// pares). Sem isso, uma combinação assim nunca era marcada divergente:
// pfGap ficava sempre null e a checagem inteira virava um no-op pra ela,
// mesmo perdendo dinheiro ao vivo há semanas — achado real do
// stability-scan em 14/08/2026 (3 combinações de BICOUSDT, um par fora da
// lista curada, net perdedoras e nunca pausadas). PF ao vivo abaixo de 1.0
// já é motivo suficiente pra alerta/pausa, mesmo sem número de backtest
// pra comparar.
const ABSOLUTE_PF_FLOOR_NO_BASELINE = 1.0;

export interface Comparison {
  pair: string;
  strategyId: number;
  strategyName: string;
  timeframe: string;
  backtestPF: number | null;
  backtestSource: 'backtest-scan' | 'radar-context-scan' | null;
  liveTotalTrades: number;
  livePF: number;
  liveExpectancy: number;
  hasEnoughLiveData: boolean;
  divergent: boolean;
  // true quando "divergent" veio do piso absoluto (sem baseline pra
  // comparar), não do gap contra o backtest — útil pra quem lê o alerta
  // saber que não há número de backtest por trás desse veredito.
  usedAbsoluteFallback: boolean;
}

/**
 * Acha o profit factor de referência pra uma combinação, tentando
 * primeiro o scan original (backtest-scan.ts, 3 meses) e, se não achar
 * (caso das descobertas mais recentes do radar), o scan de contexto
 * (radar-context-scan.ts, 2 meses, coluna "sozinho").
 */
async function getBacktestBaseline(strategyId: number, pair: string, timeframe: string): Promise<{ pf: number; source: 'backtest-scan' | 'radar-context-scan' } | null> {
  const bs = await prisma.backtestScan.findUnique({
    where: { strategyId_pair_timeframe_months: { strategyId, pair, timeframe, months: BACKTEST_MONTHS } },
  });
  if (bs) return { pf: bs.profitFactor, source: 'backtest-scan' };

  const rcs = await prisma.radarContextScan.findUnique({
    where: { strategyId_pair_timeframe_months: { strategyId, pair, timeframe, months: CONTEXT_MONTHS } },
  });
  if (rcs) return { pf: rcs.unfilteredPF, source: 'radar-context-scan' };

  return null;
}

/**
 * Compara, pra cada combinação em produção agora, o profit factor real
 * (últimos N dias) contra o que o backtest previa. Só marca como
 * "divergente" quando já há amostra mínima ao vivo pra dizer algo com
 * confiança (menos que isso, qualquer diferença pode ser só ruído).
 */
export async function checkAllDivergences(plan: PairStrategyPlan, days: number = 14): Promise<Comparison[]> {
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const comparisons: Comparison[] = [];

  for (const [pair, strategyTimeframes] of Object.entries(plan)) {
    for (const [strategyIdStr, timeframes] of Object.entries(strategyTimeframes)) {
      const strategyId = Number(strategyIdStr);
      const strat = STRATEGY_DEFS.find((s) => s.id === strategyId);
      if (!strat) continue;

      for (const tf of timeframes) {
        const baseline = await getBacktestBaseline(strategyId, pair, tf);

        const liveSignals = await prisma.signal.findMany({
          where: {
            strategyId, pair, timeframe: tf, source: 'live',
            status: { in: ['WIN', 'LOSS'] },
            createdAt: { gte: sinceDate },
          },
        });
        const liveMetrics = computeMetrics(liveSignals as TradeLike[]);

        const hasEnoughLiveData = liveMetrics.totalTrades >= MIN_LIVE_TRADES;
        const pfGap = baseline ? liveMetrics.profitFactor - baseline.pf : null;
        const divergentVsBaseline = hasEnoughLiveData && pfGap !== null && pfGap < PF_GAP_THRESHOLD;
        const divergentNoBaseline = hasEnoughLiveData && !baseline && liveMetrics.profitFactor < ABSOLUTE_PF_FLOOR_NO_BASELINE;
        const divergent = divergentVsBaseline || divergentNoBaseline;

        comparisons.push({
          pair, strategyId, strategyName: strat.name, timeframe: tf,
          backtestPF: baseline?.pf ?? null,
          backtestSource: baseline?.source ?? null,
          liveTotalTrades: liveMetrics.totalTrades,
          livePF: liveMetrics.profitFactor,
          liveExpectancy: liveMetrics.expectancy,
          hasEnoughLiveData,
          divergent,
          usedAbsoluteFallback: divergentNoBaseline,
        });
      }
    }
  }

  return comparisons;
}

/**
 * Versão "global" (sem usuário logado, pro agendador) — mescla o plano de
 * todos os usuários, igual o resto do sistema já faz.
 */
export async function checkGlobalDivergences(days: number = 14): Promise<Comparison[]> {
  const { getGlobalPairStrategyPlan } = await import('./analysis-engine');
  const plan = await getGlobalPairStrategyPlan();
  return checkAllDivergences(plan, days);
}

const DIVERGENCE_CHECK_STATE_KEY = 'last_divergence_check';
const MIN_HOURS_BETWEEN_CHECKS = 20; // roda no máximo 1x por dia, não a cada ciclo

// Quantas checagens diárias SEGUIDAS uma combinação precisa aparecer
// divergente (com amostra ao vivo suficiente) antes de ser pausada
// automaticamente. Como a checagem só roda 1x/dia, 3 = ~3 dias de
// divergência confirmada — não é reação a um dia ruim isolado, que pode
// ser só ruído.
const DIVERGENCE_PAUSE_THRESHOLD = 3;

function comboKey(strategyId: number, pair: string, timeframe: string): string {
  return `${strategyId}|${pair}|${timeframe}`;
}

/**
 * Atualiza o contador de dias consecutivos divergentes por combinação e
 * pausa automaticamente quem passar do limite. Combinações sem amostra ao
 * vivo suficiente ainda (hasEnoughLiveData = false) não mexem no contador
 * — nem zeram, nem incrementam — porque "sem dado" não é a mesma coisa que
 * "sem divergência".
 */
async function updateStreaksAndAutoPause(all: Comparison[]): Promise<Comparison[]> {
  const newlyPaused: Comparison[] = [];

  for (const c of all) {
    if (!c.hasEnoughLiveData) continue;

    const existing = await prisma.divergenceStreak.findUnique({
      where: { strategyId_pair_timeframe: { strategyId: c.strategyId, pair: c.pair, timeframe: c.timeframe } },
    });

    if (c.divergent) {
      const streak = (existing?.streak ?? 0) + 1;
      const shouldPause = streak >= DIVERGENCE_PAUSE_THRESHOLD && !existing?.paused;

      await prisma.divergenceStreak.upsert({
        where: { strategyId_pair_timeframe: { strategyId: c.strategyId, pair: c.pair, timeframe: c.timeframe } },
        update: {
          streak,
          lastCheckedAt: new Date(),
          ...(shouldPause ? { paused: true, pausedAt: new Date() } : {}),
        },
        create: {
          strategyId: c.strategyId, pair: c.pair, timeframe: c.timeframe,
          streak, paused: shouldPause, pausedAt: shouldPause ? new Date() : null,
        },
      });

      if (shouldPause) {
        newlyPaused.push(c);
        await logPilotEvent(
          'AUTO_PAUSE',
          `${c.pair} × ${c.strategyName} × ${c.timeframe} pausada automaticamente após ${DIVERGENCE_PAUSE_THRESHOLD} checagens seguidas divergentes (PF ao vivo ${c.livePF.toFixed(2)}${c.backtestPF !== null ? `, backtest ${c.backtestPF.toFixed(2)}` : ', sem baseline'}).`,
          { strategyId: c.strategyId, pair: c.pair, timeframe: c.timeframe }
        );
      }
    } else if (existing && (existing.streak > 0 || existing.paused)) {
      // Voltou a performar dentro do esperado — zera o contador. Não
      // despausa sozinho: uma combinação pausada exige olhar humano antes
      // de voltar a gerar sinal ao vivo (ver resumeDivergentCombo).
      await prisma.divergenceStreak.update({
        where: { strategyId_pair_timeframe: { strategyId: c.strategyId, pair: c.pair, timeframe: c.timeframe } },
        data: { streak: 0, lastCheckedAt: new Date() },
      });
    }
  }

  return newlyPaused;
}

/**
 * Combinações (estratégia+par+timeframe) pausadas automaticamente por
 * divergência persistente — usado por lib/analysis-engine.ts pra não gerar
 * sinal novo ao vivo pra elas, mesmo que o usuário ainda tenha a
 * estratégia/par habilitados em Configurações.
 */
export async function getPausedComboKeys(): Promise<Set<string>> {
  const paused = await prisma.divergenceStreak.findMany({ where: { paused: true } });
  return new Set(paused.map((p) => comboKey(p.strategyId, p.pair, p.timeframe)));
}

/**
 * Reativa manualmente uma combinação pausada (ex: depois de investigar e
 * decidir que ainda vale rodar, ou depois de ajustar a estratégia).
 */
export async function resumeDivergentCombo(strategyId: number, pair: string, timeframe: string): Promise<void> {
  await prisma.divergenceStreak.updateMany({
    where: { strategyId, pair, timeframe },
    data: { streak: 0, paused: false, pausedAt: null },
  });
}

/**
 * Só roda de verdade uma vez por dia, mesmo sendo chamada a cada ciclo do
 * agendador (que roda de 5 em 5 minutos) — evita gastar tempo/chamadas
 * à toa e, mais importante, evita mandar o mesmo alerta repetidas vezes.
 */
export async function runDailyDivergenceCheckIfDue(): Promise<{ ran: boolean; divergences: Comparison[]; newlyPaused: Comparison[] }> {
  const state = await prisma.systemState.findUnique({ where: { key: DIVERGENCE_CHECK_STATE_KEY } });
  if (state) {
    const hoursSince = (Date.now() - new Date(state.value).getTime()) / (1000 * 60 * 60);
    if (hoursSince < MIN_HOURS_BETWEEN_CHECKS) {
      return { ran: false, divergences: [], newlyPaused: [] };
    }
  }

  const all = await checkGlobalDivergences(14);
  const divergences = all.filter((c) => c.divergent);
  const newlyPaused = await updateStreaksAndAutoPause(all);

  if (divergences.length > 0) {
    await logPilotEvent(
      'DIVERGENCE_DETECTED',
      `Checagem diária: ${divergences.length} combinação(ões) divergente(s) — ${divergences.map((d) => `${d.pair}/${d.strategyName}/${d.timeframe}`).join(', ')}.`
    );
  }

  await prisma.systemState.upsert({
    where: { key: DIVERGENCE_CHECK_STATE_KEY },
    update: { value: new Date().toISOString() },
    create: { key: DIVERGENCE_CHECK_STATE_KEY, value: new Date().toISOString() },
  });

  if (divergences.length > 0) {
    await notifyDivergences(divergences, newlyPaused);
  }

  return { ran: true, divergences, newlyPaused };
}

async function notifyDivergences(divergences: Comparison[], newlyPaused: Comparison[] = []): Promise<void> {
  const { sendTelegramMessage } = await import('./telegram');
  const { sendEmail } = await import('./mailer');

  const pausedKeys = new Set(newlyPaused.map((c) => comboKey(c.strategyId, c.pair, c.timeframe)));

  const lines = divergences.map((d) => {
    const pct = d.backtestPF ? d.livePF - d.backtestPF : 0;
    const wasPaused = pausedKeys.has(comboKey(d.strategyId, d.pair, d.timeframe));
    const basis = d.usedAbsoluteFallback
      ? '(sem baseline de backtest — PF ao vivo abaixo de 1.0)'
      : `backtest PF ${d.backtestPF?.toFixed(2) ?? '?'}, ${pct >= 0 ? '+' : ''}${pct.toFixed(2)} vs. ele`;
    return `• ${d.pair} ${d.strategyName} (${d.timeframe}): ao vivo PF ${d.livePF.toFixed(2)} (${d.liveTotalTrades} trades) — ${basis}${wasPaused ? ' — ⏸️ PAUSADA AUTOMATICAMENTE' : ''}`;
  });

  const pauseNote = newlyPaused.length > 0
    ? `\n\n⏸️ ${newlyPaused.length} combinação(ões) foram pausadas automaticamente após ${DIVERGENCE_PAUSE_THRESHOLD} checagens seguidas divergentes — pararam de gerar sinal novo ao vivo até alguém reativar manualmente (ver aba Backtest → "Backtest vs Ao Vivo").`
    : '';

  const telegramText =
    `⚠️ <b>Divergência detectada</b>\n\n` +
    `${divergences.length} combinação(ões) em produção estão performando bem abaixo do que o backtest previu, já com amostra ao vivo suficiente pra confiar:\n\n` +
    lines.join('\n') +
    `\n\nVale conferir a aba Backtest → "Backtest vs Ao Vivo" pra decidir se ajusta ou pausa alguma.` +
    pauseNote;

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e1a; color: #fff; padding: 24px; border-radius: 12px;">
      <h2 style="color: #f0b90b;">⚠️ Divergência detectada</h2>
      <p>${divergences.length} combinação(ões) em produção performando abaixo do esperado:</p>
      <ul>${divergences.map((d) => {
        const wasPaused = pausedKeys.has(comboKey(d.strategyId, d.pair, d.timeframe));
        const basis = d.usedAbsoluteFallback ? 'sem baseline de backtest — PF abaixo de 1.0' : `backtest PF ${d.backtestPF?.toFixed(2) ?? '?'}`;
        return `<li>${d.pair} ${d.strategyName} (${d.timeframe}): ao vivo PF ${d.livePF.toFixed(2)} (${d.liveTotalTrades} trades) — ${basis}${wasPaused ? ' — <b>pausada automaticamente</b>' : ''}</li>`;
      }).join('')}</ul>
      ${newlyPaused.length > 0 ? `<p><b>${newlyPaused.length} combinação(ões) pausadas automaticamente</b> após ${DIVERGENCE_PAUSE_THRESHOLD} checagens seguidas divergentes.</p>` : ''}
      <p>Confira a aba Backtest → "Backtest vs Ao Vivo" no dashboard.</p>
    </div>
  `;

  const subscribers = await prisma.userSettings.findMany({
    where: {
      OR: [
        { emailAlerts: true, alertEmail: { not: null } },
        { telegramAlerts: true, telegramChatId: { not: null } },
      ],
    },
  });

  for (const sub of subscribers) {
    if (sub.telegramAlerts && sub.telegramChatId) {
      try { await sendTelegramMessage(sub.telegramChatId, telegramText); } catch (e: any) { console.error('Divergence Telegram error:', e?.message); }
    }
    if (sub.emailAlerts && sub.alertEmail) {
      try { await sendEmail({ to: sub.alertEmail, subject: `⚠️ Robô Trade — ${divergences.length} divergência(s) detectada(s)`, html: emailHtml }); } catch (e: any) { console.error('Divergence email error:', e?.message); }
    }
  }
}
