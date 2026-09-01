/**
 * Agendador standalone do Robô Trade — versão "processo contínuo" (pensado
 * pra rodar numa VPS ou máquina sempre ligada).
 *
 * A lógica de cada ciclo (gerar/fechar sinal, checagem de divergência,
 * resumo semanal, heartbeat, contador de falhas) vive em lib/cycle-runner.ts
 * — esse arquivo aqui só cuida do loop (node-cron) e do stability-scan
 * semanal, que fica de fora do ciclo compartilhado de propósito (ver nota
 * em lib/cycle-runner.ts).
 *
 * Se você NÃO quer manter processo próprio rodando 24/7, existe um caminho
 * alternativo sem servidor: GitHub Actions chamando
 * app/api/cron/run-cycle/route.ts (rota protegida por CRON_SECRET) a cada
 * 15 min, mais um workflow semanal separado pro stability-scan. Ver
 * .github/workflows/ e a seção correspondente do README.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/scheduler.ts
 *   (ou, depois de configurado no package.json: npm run scheduler)
 *
 * Intervalo configurável via .env:
 *   SCHEDULER_INTERVAL_MINUTES=15   (padrão: 15)
 *
 * Monitoramento do próprio agendador (opcional) via .env:
 *   HEALTHCHECK_PING_URL=https://hc-ping.com/seu-uuid-aqui
 *   Ver lib/cycle-runner.ts pro racional completo (dead man's switch).
 *
 * Para rodar continuamente em produção, use um process manager (pm2,
 * systemd, supervisord) ou o serviço "scheduler" do docker-compose.yml
 * incluído neste projeto.
 */
import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { runSignalCycle } from '../lib/cycle-runner';
import { runWeeklyStabilityScanIfDue } from '../lib/stability-engine';

const INTERVAL_MINUTES = Math.max(1, parseInt(process.env.SCHEDULER_INTERVAL_MINUTES ?? '15', 10) || 15);
const CRON_EXPRESSION = `*/${INTERVAL_MINUTES} * * * *`;
const HEALTHCHECK_PING_URL = process.env.HEALTHCHECK_PING_URL;

let running = false;

function log(msg: string) {
  console.log(`[scheduler ${new Date().toISOString()}] ${msg}`);
}

async function runCycle() {
  if (running) {
    log('Ciclo anterior ainda em execução, pulando esta rodada.');
    return;
  }
  running = true;

  try {
    const result = await runSignalCycle(INTERVAL_MINUTES);
    for (const line of result.lines) log(line);

    // Só roda de verdade 1x/semana (ver MIN_HOURS_BETWEEN_SCANS em
    // lib/stability-engine.ts) — quando roda, pode levar alguns minutos
    // (um backtest completo por combinação ao vivo), atrasando esse ciclo
    // específico, mas sem bloquear os ciclos normais de geração de sinal.
    // Isso só faz sentido aqui (processo contínuo) — no caminho serverless
    // (GitHub Actions), essa chamada vira um workflow próprio, ver
    // .github/workflows/weekly-stability-scan.yml.
    const stabilityRun = await runWeeklyStabilityScanIfDue();
    if (stabilityRun.ran) {
      const unstable = stabilityRun.results.filter((r) => r.verdict === 'INSTAVEL' || r.verdict === 'ALTA_VARIANCIA').length;
      log(`Checagem semanal de estabilidade rodada — ${unstable} de ${stabilityRun.results.length} combinação(ões) com sinal de instabilidade.`);
    }

    log(`Ciclo concluído em ${(result.durationMs / 1000).toFixed(1)}s.`);
  } catch (e: any) {
    console.error('[scheduler] Erro inesperado fora do ciclo:', e?.message ?? e);
  } finally {
    running = false;
  }
}

async function main() {
  log(`Iniciando agendador — ciclo a cada ${INTERVAL_MINUTES} minuto(s) (${CRON_EXPRESSION}).`);
  if (HEALTHCHECK_PING_URL) log('Ping de healthcheck externo configurado.');

  // Roda um ciclo imediatamente ao subir, depois passa a obedecer o cron.
  await runCycle();

  cron.schedule(CRON_EXPRESSION, () => {
    runCycle();
  });

  log('Agendador ativo. Pressione Ctrl+C para parar.');
}

async function shutdown(signal: string) {
  log(`Recebido ${signal}, encerrando...`);
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((e) => {
  console.error('[scheduler] Falha fatal ao iniciar:', e);
  process.exit(1);
});
