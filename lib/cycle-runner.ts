// Lógica de um ciclo completo do robô — extraída daqui pra poder ser
// chamada de duas formas: processo contínuo (scripts/scheduler.ts, via
// node-cron, pensado pra rodar numa VPS sempre ligada) OU sob demanda via
// HTTP protegido por segredo (app/api/cron/run-cycle/route.ts, pensado pra
// ser chamado por um agendador externo — GitHub Actions, Vercel Cron —
// sem precisar de nenhum servidor seu ligado 24/7). As duas formas rodam
// exatamente a mesma lógica, então o comportamento é idêntico não importa
// quem disparou o ciclo.
//
// O stability-scan semanal (lib/stability-engine.ts) FICA DE FORA daqui de
// propósito — ele roda um backtest completo pra cada combinação ao vivo, o
// que pode levar vários minutos (26 combinações levaram ~5-8min na prática),
// e isso estoura o limite de execução de uma função serverless (Vercel
// Hobby: ~60s mesmo com maxDuration configurado). Se for pelo caminho do
// GitHub Actions, o stability-scan roda num workflow separado
// (.github/workflows/weekly-stability-scan.yml) que executa o script
// direto no runner do GitHub — sem passar por HTTP nem serverless, sem
// limite de tempo apertado.
import { prisma } from './prisma';
import { generateSignals, saveNewSignals, notifySubscribedUsers, notifySignalOutcomes, getGlobalPairStrategyPlan } from './analysis-engine';
import { closeTriggeredSignals, checkTarget2Progress, recalculateStrategyStats } from './stats-engine';
import { runDailyDivergenceCheckIfDue } from './divergence-check';
import { runWeeklyDigestIfDue } from './weekly-digest';
import { logPilotEvent } from './pilot-log';

const HEARTBEAT_STATE_KEY = 'last_cycle_heartbeat';
const CONSECUTIVE_FAILURES_STATE_KEY = 'consecutive_cycle_failures';
const FAILURE_ALERT_THRESHOLD = 3; // avisa a cada 3 falhas seguidas (3, 6, 9...), não a cada uma
const HEARTBEAT_GAP_MULTIPLIER = 3; // folga de 3x o intervalo antes de soar o alarme de gap

export interface CycleResult {
  ok: boolean;
  lines: string[];
  durationMs: number;
}

async function getSystemStateValue(key: string): Promise<string | null> {
  const row = await prisma.systemState.findUnique({ where: { key } });
  return row?.value ?? null;
}

async function setSystemStateValue(key: string, value: string): Promise<void> {
  await prisma.systemState.upsert({ where: { key }, update: { value }, create: { key, value } });
}

async function checkHeartbeatGap(intervalMinutes: number, lines: string[]): Promise<void> {
  const last = await getSystemStateValue(HEARTBEAT_STATE_KEY);
  if (!last) return; // primeira vez que roda, nada pra comparar

  const minutesSince = (Date.now() - new Date(last).getTime()) / (1000 * 60);
  const threshold = intervalMinutes * HEARTBEAT_GAP_MULTIPLIER;

  if (minutesSince > threshold) {
    const msg = `Gap de heartbeat detectado: ${minutesSince.toFixed(0)} minuto(s) desde o último ciclo (esperado no máximo ~${threshold}min).`;
    lines.push(`⚠️  ${msg}`);
    await logPilotEvent('HEARTBEAT_GAP', msg);
  }
}

async function pingHealthcheck(ok: boolean): Promise<void> {
  const url = process.env.HEALTHCHECK_PING_URL;
  if (!url) return;
  try {
    await fetch(ok ? url : `${url}/fail`, { method: 'GET' });
  } catch {
    // Falha ao pingar não deve derrubar o ciclo.
  }
}

async function handleCycleFailure(error: any): Promise<void> {
  const current = parseInt((await getSystemStateValue(CONSECUTIVE_FAILURES_STATE_KEY)) ?? '0', 10) || 0;
  const failures = current + 1;
  await setSystemStateValue(CONSECUTIVE_FAILURES_STATE_KEY, String(failures));

  const message = `Ciclo falhou (${failures}ª falha seguida): ${error?.message ?? error}`;
  await logPilotEvent('CYCLE_ERROR', message);

  if (failures % FAILURE_ALERT_THRESHOLD === 0) {
    await notifyOps(`🔴 <b>Robô Trade com falhas seguidas</b>\n\n${failures} ciclo(s) seguido(s) falharam. Última mensagem de erro:\n${error?.message ?? error}`);
  }
}

async function handleCycleSuccess(): Promise<void> {
  const current = parseInt((await getSystemStateValue(CONSECUTIVE_FAILURES_STATE_KEY)) ?? '0', 10) || 0;
  if (current > 0) {
    await setSystemStateValue(CONSECUTIVE_FAILURES_STATE_KEY, '0');
    const message = `Ciclo voltou a rodar normal depois de ${current} falha(s) seguida(s).`;
    await logPilotEvent('CYCLE_RECOVERED', message);
    await notifyOps(`🟢 <b>Robô Trade recuperado</b>\n\n${message}`);
  }
}

async function notifyOps(text: string): Promise<void> {
  try {
    const { sendTelegramMessage } = await import('./telegram');
    const { sendEmail } = await import('./mailer');
    const subscribers = await prisma.userSettings.findMany({
      where: { OR: [{ emailAlerts: true, alertEmail: { not: null } }, { telegramAlerts: true, telegramChatId: { not: null } }] },
    });
    for (const sub of subscribers) {
      if (sub.telegramAlerts && sub.telegramChatId) {
        try { await sendTelegramMessage(sub.telegramChatId, text); } catch (e: any) { console.error('Ops Telegram error:', e?.message); }
      }
      if (sub.emailAlerts && sub.alertEmail) {
        try { await sendEmail({ to: sub.alertEmail, subject: 'Robô Trade — status do agendador', html: `<div style="font-family:Arial,sans-serif;">${text.replace(/\n/g, '<br/>')}</div>` }); } catch (e: any) { console.error('Ops email error:', e?.message); }
      }
    }
  } catch (e: any) {
    console.error('[cycle] Falha ao notificar status operacional:', e?.message);
  }
}

/**
 * Um ciclo completo — geração/fechamento de sinal, checagem diária de
 * divergência, resumo semanal, heartbeat, contador de falhas, ping de
 * healthcheck externo. NÃO inclui o stability-scan semanal (ver nota no
 * topo do arquivo).
 */
export async function runSignalCycle(intervalMinutes: number = 15): Promise<CycleResult> {
  const start = Date.now();
  const lines: string[] = [];
  let ok = false;

  // Também precisa estar protegido — se o banco estiver inalcançável (ex:
  // Neon suspenso), essa chamada não pode derrubar a rota inteira com um
  // 500 sem corpo antes mesmo de chegar no try/catch principal.
  try {
    await checkHeartbeatGap(intervalMinutes, lines);
  } catch (e: any) {
    lines.push(`Não foi possível checar heartbeat (banco indisponível?): ${e?.message ?? e}`);
  }

  try {
    const pairStrategyPlan = await getGlobalPairStrategyPlan();
    lines.push(`Analisando ${Object.keys(pairStrategyPlan).length} par(es)...`);

    const newSignals = await generateSignals(pairStrategyPlan);
    const saved = await saveNewSignals(newSignals);
    await notifySubscribedUsers(saved);
    lines.push(`${saved.length} sinal(is) novo(s) salvo(s) de ${newSignals.length} candidato(s).`);

    const { closed, expired, closedSignals } = await closeTriggeredSignals();
    lines.push(`${closed} sinal(is) fechado(s) com dados reais da Binance, ${expired} expirado(s).`);

    const target2Signals = await checkTarget2Progress();
    if (target2Signals.length) lines.push(`${target2Signals.length} sinal(is) também alcançaram o alvo 2.`);
    await notifySignalOutcomes(closedSignals, target2Signals);

    await recalculateStrategyStats();

    const { ran, divergences, newlyPaused } = await runDailyDivergenceCheckIfDue();
    if (ran) {
      lines.push(`Checagem diária de divergência rodada — ${divergences.length} combinação(ões) divergindo${divergences.length ? ' (alerta enviado)' : ''}.`);
      if (newlyPaused.length) lines.push(`${newlyPaused.length} combinação(ões) pausada(s) automaticamente por divergência persistente.`);
    }

    const digestRun = await runWeeklyDigestIfDue();
    if (digestRun.ran) lines.push('Resumo semanal enviado.');

    ok = true;
  } catch (e: any) {
    lines.push(`Erro no ciclo: ${e?.message ?? e}`);
    await handleCycleFailure(e).catch((logErr: any) => console.error('[cycle] Falha ao registrar falha de ciclo:', logErr?.message));
  } finally {
    if (ok) {
      await handleCycleSuccess().catch((e: any) => console.error('[cycle] Falha ao registrar recuperação:', e?.message));
    }
    await setSystemStateValue(HEARTBEAT_STATE_KEY, new Date().toISOString()).catch((e: any) => console.error('[cycle] Falha ao gravar heartbeat:', e?.message));
    await pingHealthcheck(ok);
  }

  return { ok, lines, durationMs: Date.now() - start };
}
