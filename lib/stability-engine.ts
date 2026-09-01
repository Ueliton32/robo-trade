// Checagem de estabilidade fora da amostra — lógica central compartilhada
// entre scripts/stability-check.ts (uma combinação, ad-hoc),
// scripts/stability-scan.ts (todas as combinações ao vivo, ad-hoc) e o
// agendador (lib/scheduler via runWeeklyStabilityScanIfDue, automático,
// 1x/semana). Ver scripts/stability-check.ts pro racional completo de por
// que isso existe (risco de overfitting nos limiares tunados olhando pro
// período inteiro do backtest).
import { runBacktest, BacktestTrade } from './backtest-engine';
import { computeMetrics, TradeLike } from './metrics';
import { STRATEGY_DEFS } from './strategies';
import { prisma } from './prisma';
import { logPilotEvent } from './pilot-log';

const MIN_TRADES_PER_BUCKET = 5;
const DEFAULT_MONTHS = 3;
const DEFAULT_SPLITS = 2;

export type StabilityVerdict = 'INSTAVEL' | 'ALTA_VARIANCIA' | 'ESTAVEL' | 'AMOSTRA_INSUFICIENTE';

export interface StabilityResult {
  pair: string;
  strategyId: number;
  strategyName: string;
  timeframe: string;
  totalTrades: number;
  overallPF: number;
  bucketPFs: number[];
  verdict: StabilityVerdict;
}

function tradesToTradeLikes(pair: string, timeframe: string, trades: BacktestTrade[]): TradeLike[] {
  return trades.map((t) => ({
    pair, timeframe, status: t.status, pnlPercent: t.pnlPercent,
    createdAt: t.entryTime, closedAt: t.closedAt,
  }));
}

export function classifyStability(overallPF: number, bucketPFs: number[]): StabilityVerdict {
  if (bucketPFs.length < 2) return 'AMOSTRA_INSUFICIENTE';
  const worst = Math.min(...bucketPFs);
  const best = Math.max(...bucketPFs);
  if (worst < 1.0 && overallPF >= 1.0) return 'INSTAVEL';
  if (best - worst > 1.0) return 'ALTA_VARIANCIA';
  return 'ESTAVEL';
}

export async function computeStability(params: {
  strategyId: number; pair: string; timeframe: string; months: number; splits: number;
}): Promise<StabilityResult> {
  const { strategyId, pair, timeframe, months, splits } = params;
  const strat = STRATEGY_DEFS.find((s) => s.id === strategyId);
  const strategyName = strat?.name ?? String(strategyId);

  const result = await runBacktest({ strategyId, pair, timeframe, months });
  const trades = result.trades.slice().sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime());
  const overall = computeMetrics(tradesToTradeLikes(pair, timeframe, trades));

  const bucketSize = Math.ceil(trades.length / splits);
  const bucketPFs: number[] = [];
  for (let b = 0; b < splits; b++) {
    const bucket = trades.slice(b * bucketSize, (b + 1) * bucketSize);
    if (bucket.length >= MIN_TRADES_PER_BUCKET) {
      bucketPFs.push(computeMetrics(tradesToTradeLikes(pair, timeframe, bucket)).profitFactor);
    }
  }

  return {
    pair, strategyId, strategyName, timeframe,
    totalTrades: trades.length,
    overallPF: overall.profitFactor,
    bucketPFs,
    verdict: classifyStability(overall.profitFactor, bucketPFs),
  };
}

export async function persistStabilityResult(r: StabilityResult, months: number, splits: number): Promise<void> {
  await prisma.stabilityScan.upsert({
    where: { strategyId_pair_timeframe_months_splits: { strategyId: r.strategyId, pair: r.pair, timeframe: r.timeframe, months, splits } },
    update: { strategyName: r.strategyName, totalTrades: r.totalTrades, overallPF: r.overallPF, bucketPFs: r.bucketPFs, verdict: r.verdict, runAt: new Date() },
    create: {
      strategyId: r.strategyId, strategyName: r.strategyName, pair: r.pair, timeframe: r.timeframe,
      months, splits, totalTrades: r.totalTrades, overallPF: r.overallPF, bucketPFs: r.bucketPFs, verdict: r.verdict,
    },
  });
}

const STABILITY_SCAN_STATE_KEY = 'last_stability_scan';
const MIN_HOURS_BETWEEN_SCANS = 24 * 7; // semanal — mesmo espírito do throttle diário da divergência
const DELAY_BETWEEN_COMBOS_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Roda o stability-scan pra TODAS as combinações ao vivo agora, no máximo
 * 1x por semana, chamado a cada ciclo do agendador (mesmo padrão de
 * runDailyDivergenceCheckIfDue em lib/divergence-check.ts). Persiste cada
 * resultado em StabilityScan — histórico consultável, não só saída de
 * terminal de quem rodou manual.
 *
 * Deliberadamente NÃO pausa nada sozinho — isso é sobre estabilidade do
 * backtest no tempo (o limiar tunado é robusto ou só encaixou num
 * sub-período de sorte?), um sinal diferente do que o auto-pause por
 * divergência (lib/divergence-check.ts) já cobre (PF ao vivo vs backtest).
 * Uma combinação "instável" aqui pode continuar com PF ao vivo saudável —
 * decisão de pausar fica pra quem olhar o relatório.
 */
export async function runWeeklyStabilityScanIfDue(): Promise<{ ran: boolean; results: StabilityResult[] }> {
  const state = await prisma.systemState.findUnique({ where: { key: STABILITY_SCAN_STATE_KEY } });
  if (state) {
    const hoursSince = (Date.now() - new Date(state.value).getTime()) / (1000 * 60 * 60);
    if (hoursSince < MIN_HOURS_BETWEEN_SCANS) return { ran: false, results: [] };
  }

  const { getGlobalPairStrategyPlan } = await import('./analysis-engine');
  const plan = await getGlobalPairStrategyPlan();
  const combos: { pair: string; strategyId: number; timeframe: string }[] = [];
  for (const [pair, strategies] of Object.entries(plan)) {
    for (const [sidStr, tfs] of Object.entries(strategies)) {
      for (const tf of tfs) combos.push({ pair, strategyId: Number(sidStr), timeframe: tf });
    }
  }

  const results: StabilityResult[] = [];
  for (const combo of combos) {
    try {
      const r = await computeStability({ ...combo, months: DEFAULT_MONTHS, splits: DEFAULT_SPLITS });
      results.push(r);
      await persistStabilityResult(r, DEFAULT_MONTHS, DEFAULT_SPLITS);
    } catch (e: any) {
      console.error(`[stability-scan] Erro em ${combo.pair}/${combo.strategyId}/${combo.timeframe}:`, e?.message);
    }
    await sleep(DELAY_BETWEEN_COMBOS_MS);
  }

  await prisma.systemState.upsert({
    where: { key: STABILITY_SCAN_STATE_KEY },
    update: { value: new Date().toISOString() },
    create: { key: STABILITY_SCAN_STATE_KEY, value: new Date().toISOString() },
  });

  const unstable = results.filter((r) => r.verdict === 'INSTAVEL' || r.verdict === 'ALTA_VARIANCIA');
  await logPilotEvent(
    'STABILITY_SCAN',
    `Scan semanal: ${results.length} combinação(ões) avaliada(s), ${unstable.length} com sinal de instabilidade${unstable.length ? ' — ' + unstable.map((r) => `${r.pair}/${r.strategyName}/${r.timeframe} (${r.verdict})`).join(', ') : ''}.`
  );
  if (unstable.length > 0) {
    await notifyStabilityResults(unstable);
  }

  return { ran: true, results };
}

/**
 * Paridade com notifyDivergences (lib/divergence-check.ts) — até
 * 14/08/2026 o stability-scan só logava no console, então uma combinação
 * nova ficando instável nunca chegava a ninguém a menos que alguém abrisse
 * o dashboard por conta própria.
 */
async function notifyStabilityResults(unstable: StabilityResult[]): Promise<void> {
  const { sendTelegramMessage } = await import('./telegram');
  const { sendEmail } = await import('./mailer');

  const lines = unstable.map((r) =>
    `• ${r.pair} ${r.strategyName} (${r.timeframe}): PF geral ${r.overallPF.toFixed(2)}, pedaços [${r.bucketPFs.map((p) => p.toFixed(2)).join(', ')}] — ${r.verdict === 'INSTAVEL' ? 'instável' : 'alta variância'}`
  );

  const telegramText =
    `📉 <b>Checagem semanal de estabilidade</b>\n\n` +
    `${unstable.length} combinação(ões) ao vivo com sinal de instabilidade no backtest (resultado bom pode estar concentrado num sub-período, não é uma divergência de PF ao vivo — ver aba Backtest → "Estabilidade fora da amostra" pra decidir se pausa alguma):\n\n` +
    lines.join('\n');

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e1a; color: #fff; padding: 24px; border-radius: 12px;">
      <h2 style="color: #f0b90b;">📉 Checagem semanal de estabilidade</h2>
      <p>${unstable.length} combinação(ões) ao vivo com sinal de instabilidade no backtest:</p>
      <ul>${unstable.map((r) => `<li>${r.pair} ${r.strategyName} (${r.timeframe}): PF geral ${r.overallPF.toFixed(2)}, pedaços [${r.bucketPFs.map((p) => p.toFixed(2)).join(', ')}] — ${r.verdict === 'INSTAVEL' ? 'instável' : 'alta variância'}</li>`).join('')}</ul>
      <p>Confira a aba Backtest → "Estabilidade fora da amostra" no dashboard.</p>
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
      try { await sendTelegramMessage(sub.telegramChatId, telegramText); } catch (e: any) { console.error('Stability Telegram error:', e?.message); }
    }
    if (sub.emailAlerts && sub.alertEmail) {
      try { await sendEmail({ to: sub.alertEmail, subject: `📉 Robô Trade — ${unstable.length} combinação(ões) instável(is)`, html: emailHtml }); } catch (e: any) { console.error('Stability email error:', e?.message); }
    }
  }
}
