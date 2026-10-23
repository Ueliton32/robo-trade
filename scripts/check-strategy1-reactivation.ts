/**
 * Monitora a reativação da Estratégia 1 (Rompimento de Range) depois do
 * gate de ATR (23/10/2026, config v18, ver
 * scripts/reactivate-strategy1-validated-pairs.ts) — compara o
 * desempenho real dos sinais fechados nos 5 pares validados
 * (BTC/ETH/BNB/TRX/LINK, 15m) contra o backtest de 6 meses que
 * justificou a reativação.
 *
 * Baseline validado (scripts/experiment-range-breakout-regime-atr.ts e
 * scripts/experiment-range-breakout-regime-atr-15m-sweep.ts):
 *   BTCUSDT  PF 1.26 (n=24)
 *   ETHUSDT  PF 1.27 (n=21)
 *   BNBUSDT  PF 1.22 (n=33)
 *   TRXUSDT  PF 1.39 (n=41)
 *   LINKUSDT PF 1.62 (n=15)
 *
 * Não decide nada sozinho — só reporta (console + notifyOps, que manda
 * Telegram/e-mail pra quem tiver inscrito). Pausar ou ajustar a
 * estratégia continua sendo decisão manual.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/check-strategy1-reactivation.ts
 */
import { prisma } from '../lib/prisma';
import { computeMetrics, TradeLike } from '../lib/metrics';
import { notifyOps } from '../lib/ops-notify';

const STRATEGY_ID = 1;
const VALIDATED_TIMEFRAME = '15m';
const MIN_SAMPLE_PER_PAIR_TO_JUDGE = 10; // abaixo disso, "ainda cedo" pro par

const BACKTEST_BASELINE: Record<string, { pf: number; n: number }> = {
  BTCUSDT: { pf: 1.26, n: 24 },
  ETHUSDT: { pf: 1.27, n: 21 },
  BNBUSDT: { pf: 1.22, n: 33 },
  TRXUSDT: { pf: 1.39, n: 41 },
  LINKUSDT: { pf: 1.62, n: 15 },
};

async function getReactivationDate(): Promise<Date> {
  const v18 = await prisma.configVersion.findFirst({
    where: { changedVia: 'reactivate-strategy1-validated-pairs-script' },
    orderBy: { version: 'asc' },
  });
  return v18?.createdAt ?? new Date('2026-10-23T00:00:00Z');
}

async function main() {
  const since = await getReactivationDate();
  const pairs = Object.keys(BACKTEST_BASELINE);

  const closed = await prisma.signal.findMany({
    where: {
      strategyId: STRATEGY_ID,
      source: 'live',
      timeframe: VALIDATED_TIMEFRAME,
      pair: { in: pairs },
      status: { in: ['WIN', 'LOSS'] },
      closedAt: { gte: since },
    },
    orderBy: { closedAt: 'asc' },
  });

  const pending = await prisma.signal.count({
    where: { strategyId: STRATEGY_ID, source: 'live', timeframe: VALIDATED_TIMEFRAME, pair: { in: pairs }, status: 'PENDENTE' },
  });

  console.log('='.repeat(70));
  console.log('CHECK — Reativação da Estratégia 1 (config v18, desde ' + since.toISOString().slice(0, 10) + ')');
  console.log('='.repeat(70));
  console.log(`Sinais fechados desde a reativação: ${closed.length} | ainda pendentes: ${pending}\n`);

  const lines: string[] = [];
  lines.push(`Robô Trade — check Estratégia 1 (desde ${since.toISOString().slice(0, 10)})`);
  lines.push(`Fechados: ${closed.length} | pendentes: ${pending}`);

  let anyAlert = false;

  for (const pair of pairs) {
    const pairTrades = closed.filter((t) => t.pair === pair);
    const baseline = BACKTEST_BASELINE[pair];
    const tradeLikes: TradeLike[] = pairTrades.map((t) => ({
      pair: t.pair, timeframe: t.timeframe, status: t.status as 'WIN' | 'LOSS',
      pnlPercent: t.pnlPercent, createdAt: t.createdAt, closedAt: t.closedAt,
    }));
    const m = computeMetrics(tradeLikes);

    let verdict: string;
    if (pairTrades.length < MIN_SAMPLE_PER_PAIR_TO_JUDGE) {
      // Evita "<" no texto — notifyOps manda isso pro Telegram com
      // parse_mode HTML, e um "<" solto quebra o parser dele.
      verdict = `ainda cedo (n=${pairTrades.length}, mínimo ${MIN_SAMPLE_PER_PAIR_TO_JUDGE})`;
    } else if (m.profitFactor < 0.8) {
      verdict = `⚠ DIVERGINDO DO BACKTEST (PF ${m.profitFactor.toFixed(2)} vs esperado ${baseline.pf})`;
      anyAlert = true;
    } else if (m.profitFactor >= 0.8 && m.profitFactor < baseline.pf * 0.7) {
      verdict = `atenção — abaixo do esperado (PF ${m.profitFactor.toFixed(2)} vs esperado ${baseline.pf})`;
    } else {
      verdict = `dentro do esperado (PF ${m.profitFactor.toFixed(2)} vs esperado ${baseline.pf})`;
    }

    const line = `${pair.padEnd(10)} n=${String(pairTrades.length).padEnd(3)} PF=${m.profitFactor.toFixed(2).padEnd(5)} WR=${m.winRate.toFixed(0).padEnd(3)}% exp=${m.expectancy.toFixed(3)}% — ${verdict}`;
    console.log(line);
    lines.push(line);
  }

  // Agregado dos 5 pares juntos.
  const aggTradeLikes: TradeLike[] = closed.map((t) => ({
    pair: t.pair, timeframe: t.timeframe, status: t.status as 'WIN' | 'LOSS',
    pnlPercent: t.pnlPercent, createdAt: t.createdAt, closedAt: t.closedAt,
  }));
  const agg = computeMetrics(aggTradeLikes);
  console.log('-'.repeat(70));
  console.log(`AGREGADO: n=${closed.length} PF=${agg.profitFactor.toFixed(2)} WR=${agg.winRate.toFixed(0)}% exp=${agg.expectancy.toFixed(3)}%`);
  lines.push('-'.repeat(40));
  lines.push(`Agregado: n=${closed.length} PF=${agg.profitFactor.toFixed(2)} WR=${agg.winRate.toFixed(0)}% exp=${agg.expectancy.toFixed(3)}%`);

  if (anyAlert) {
    lines.push('\n⚠ Pelo menos um par divergiu do backtest — considerar revisar/pausar.');
  } else if (closed.length < pairs.length * MIN_SAMPLE_PER_PAIR_TO_JUDGE) {
    lines.push('\nAmostra ainda pequena — continuar acompanhando antes de tirar conclusão.');
  } else {
    lines.push('\nDesempenho dentro do esperado pelo backtest até agora.');
  }

  await notifyOps(lines.join('\n'));
  console.log('\nNotificação enviada via notifyOps (Telegram/e-mail pra quem estiver inscrito).');
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[check-strategy1-reactivation] Falha:', e?.message ?? e); process.exit(1); });
