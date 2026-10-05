/**
 * Mede o risco de gap nos stops dos sinais reais fechados — o ponto cego do
 * modelo de custos (ver lib/trading-costs.ts): o simulador (e o fechamento
 * real em lib/stats-engine.ts) grava toda saída por STOP exatamente no
 * nível do stop, mesmo quando o candle de 15m que a disparou ABRIU além do
 * stop (gap), caso em que uma ordem de stop a mercado teria sido executada
 * perto da abertura, pior que o stop.
 *
 * Pra cada sinal fechado por STOP, busca o candle de 15m de fechamento
 * (closedAt = closeTime do candle) e calcula o quanto a abertura passou do
 * stop, em % do preço de entrada. É um piso do slippage real: dentro do
 * candle o preço pode ter ultrapassado mais, o que só dado de tick mostraria.
 * Só leitura. Compara PnL líquido registrado vs. com a perda extra.
 *
 *   npx tsx --require dotenv/config scripts/measure-stop-gap.ts
 */
import { prisma } from '../lib/prisma';
import { getHistoricalKlines } from '../lib/binance';

const CANDLE_MS = 15 * 60 * 1000;
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const pf = (r: number[]) => { const g = r.filter((x) => x > 0).reduce((a, b) => a + b, 0), l = -r.filter((x) => x < 0).reduce((a, b) => a + b, 0); return l ? (g / l).toFixed(2) : 'inf'; };

async function main() {
  const all = await prisma.signal.findMany({
    where: { source: 'live', status: { not: 'PENDENTE' } },
    select: { pair: true, strategyId: true, direction: true, timeframe: true, entryPrice: true, stopLoss: true, exitReason: true, closedAt: true, pnlPercent: true, pnlNetPercent: true },
  });
  const net = (s: any) => s.pnlNetPercent ?? s.pnlPercent ?? 0;
  const stops = all.filter((s) => s.exitReason === 'STOP' && s.closedAt);
  console.log(`Sinais fechados: ${all.length} | saídas por STOP: ${stops.length}\n`);

  const extra = new Map<(typeof all)[number], number>();
  let fetched = 0, missing = 0;
  for (const s of stops) {
    const close = s.closedAt!.getTime();
    const ks = await getHistoricalKlines(s.pair, '15m', close - CANDLE_MS, close);
    const k = ks.find((x) => Math.abs(x.closeTime - close) < 60_000);
    if (!k) { missing++; continue; }
    fetched++;
    const isLong = s.direction === 'LONG';
    const gap = isLong ? (s.stopLoss - k.open) / s.entryPrice * 100 : (k.open - s.stopLoss) / s.entryPrice * 100;
    extra.set(s, Math.max(0, gap));
    await new Promise((r) => setTimeout(r, 120));
  }
  console.log(`Candles encontrados: ${fetched} | não encontrados: ${missing}\n`);

  const report = (label: string, rows: typeof stops) => {
    const g = rows.map((s) => extra.get(s)).filter((x): x is number => x !== undefined);
    if (!g.length) return;
    const withGap = g.filter((x) => x > 0.0001);
    console.log(`${label}: n=${g.length} | com gap: ${withGap.length} (${(100 * withGap.length / g.length).toFixed(0)}%) | perda extra média por stop=${(g.reduce((a, b) => a + b, 0) / g.length).toFixed(3)}% | p90=${q(g, .9).toFixed(3)}% | máx=${Math.max(...g).toFixed(2)}%`);
  };
  report('Todos os stops', stops);
  report('#1 (todas)', stops.filter((s) => s.strategyId === 1));
  report('#1 LONG', stops.filter((s) => s.strategyId === 1 && s.direction === 'LONG'));
  report('#3', stops.filter((s) => s.strategyId === 3));
  report('#6', stops.filter((s) => s.strategyId === 6));
  const byTf = [...new Set(stops.map((s) => s.timeframe))];
  byTf.forEach((tf) => report(`timeframe ${tf}`, stops.filter((s) => s.timeframe === tf)));

  // Efeito no resultado: PnL líquido registrado vs. descontando o gap nos stops medidos
  const adj = (s: (typeof all)[number]) => net(s) - (extra.get(s) ?? 0);
  const slice = (label: string, rows: typeof all) => {
    const a = rows.map(net), b = rows.map(adj);
    console.log(`  ${label.padEnd(22)} n=${String(rows.length).padStart(3)} | registrado: PF=${pf(a)} soma=${a.reduce((x, y) => x + y, 0).toFixed(1)}% | com gap: PF=${pf(b)} soma=${b.reduce((x, y) => x + y, 0).toFixed(1)}%`);
  };
  console.log('\nEfeito no PnL líquido (só os stops medidos recebem a perda extra):');
  slice('Todos', all);
  slice('Últimos 30 dias', all.filter((s) => s.closedAt && Date.now() - s.closedAt.getTime() <= 30 * 86400e3));
  slice('#1', all.filter((s) => s.strategyId === 1));
  slice('#6', all.filter((s) => s.strategyId === 6));

  console.log('\nMaiores gaps:');
  [...extra.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).forEach(([s, g]) =>
    console.log(`  ${s.closedAt!.toISOString().slice(0, 16)} ${s.pair.padEnd(10)} #${s.strategyId} ${s.direction} ${s.timeframe}: +${g.toFixed(2)}% além do stop`));
}

main().catch((e) => { console.error('ERRO:', e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
