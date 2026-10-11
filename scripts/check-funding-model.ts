/**
 * Confere o modelo de funding de lib/trading-costs.ts contra o que a Binance
 * realmente cobrou. O modelo assume liquidação a cada 8h e usa a taxa do momento
 * do sinal × floor(horas/8); na prática o intervalo varia por contrato (8h, 4h,
 * 1h) e as liquidações caem em horários fixos. Só leitura.
 *
 *  A) quais pares nossos têm intervalo ≠ 8h (/fapi/v1/fundingInfo + espaçamento real)
 *  B) para cada sinal live fechado: funding gravado vs funding real (soma das
 *     liquidações entre abertura e fechamento, com as taxas de cada uma) vs um
 *     modelo "só contagem corrigida" (cruzamentos reais × taxa do sinal), pra
 *     separar o erro de contagem do erro de taxa.
 *
 *   npx tsx --require dotenv/config scripts/check-funding-model.ts
 */
import { prisma } from '../lib/prisma';
import { getHistoricalFundingRates } from '../lib/binance';
import { ALL_AVAILABLE_PAIRS } from '../lib/strategies';

const HOUR = 3600_000;
const q = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const pf = (r: number[]) => { const g = r.filter((x) => x > 0).reduce((a, b) => a + b, 0), l = -r.filter((x) => x < 0).reduce((a, b) => a + b, 0); return l ? (g / l).toFixed(3) : 'inf'; };

async function main() {
  // A) intervalos declarados
  const info: { symbol: string; fundingIntervalHours: number }[] = await (await fetch('https://fapi.binance.com/fapi/v1/fundingInfo')).json();
  const declared = new Map(info.map((i) => [i.symbol, i.fundingIntervalHours]));
  console.log(`A) /fundingInfo lista ${info.length} contratos com intervalo/cap ajustado. Nossos 21 pares disponíveis:`);
  const nonStd = ALL_AVAILABLE_PAIRS.filter((p) => (declared.get(p) ?? 8) !== 8);
  console.log(`   declarados com intervalo ≠ 8h: ${nonStd.length ? nonStd.map((p) => `${p}=${declared.get(p)}h`).join(', ') : 'nenhum'}`);

  // B) sinais live fechados
  const sigs = await prisma.signal.findMany({
    where: { source: 'live', status: { in: ['WIN', 'LOSS'] }, closedAt: { not: null } },
    select: { id: true, pair: true, strategyId: true, direction: true, createdAt: true, closedAt: true, fundingRateAtSignal: true, fundingCostPercent: true, pnlNetPercent: true, pnlPercent: true },
  });
  const pairs = [...new Set(sigs.map((s) => s.pair))];
  const t0 = Math.min(...sigs.map((s) => s.createdAt.getTime())) - 2 * 24 * HOUR;
  const hist = new Map<string, { t: number; r: number }[]>();
  for (const p of pairs) {
    hist.set(p, (await getHistoricalFundingRates(p, t0, Date.now())).map((f) => ({ t: f.fundingTime, r: parseFloat(f.fundingRate) })).sort((a, b) => a.t - b.t));
  }
  const intervalOf = (p: string) => { const h = hist.get(p) ?? []; const gaps = h.slice(1).map((x, i) => (x.t - h[i].t) / HOUR); return q(gaps, 0.5); };
  const realInterval = new Map(pairs.map((p) => [p, intervalOf(p)]));
  const odd = pairs.filter((p) => Math.abs((realInterval.get(p) ?? 8) - 8) > 0.5);
  console.log(`   espaçamento real das liquidações nos ${pairs.length} pares dos sinais fechados: ${odd.length ? odd.map((p) => `${p}=${realInterval.get(p)}h`).join(', ') : 'todos 8h'}\n`);

  // B) por sinal
  const rows = sigs.map((s) => {
    const a = s.createdAt.getTime(), b = s.closedAt!.getTime(), sign = s.direction === 'SHORT' ? -1 : 1;
    const settles = (hist.get(s.pair) ?? []).filter((x) => x.t > a && x.t <= b);
    const actual = settles.reduce((acc, x) => acc + x.r, 0) * 100 * sign;
    const crossingModel = (s.fundingRateAtSignal ?? 0) * 100 * settles.length * sign;   // contagem real × taxa do sinal
    const recorded = s.fundingCostPercent ?? 0;
    const hold = (b - a) / HOUR;
    return { s, actual, crossingModel, recorded, hold, n: settles.length, net: s.pnlNetPercent ?? s.pnlPercent ?? 0 };
  });
  const sum = (f: (r: (typeof rows)[0]) => number) => rows.reduce((acc, r) => acc + f(r), 0);
  const mae = (f: (r: (typeof rows)[0]) => number) => sum((r) => Math.abs(f(r) - r.actual)) / rows.length;
  console.log(`B) ${rows.length} sinais fechados (duração mediana ${q(rows.map((r) => r.hold), .5).toFixed(1)}h, p90 ${q(rows.map((r) => r.hold), .9).toFixed(0)}h; liquidações cruzadas por sinal: mediana ${q(rows.map((r) => r.n), .5)}, p90 ${q(rows.map((r) => r.n), .9)})`);
  console.log(`   funding total (pontos %, + = custo):   gravado ${sum((r) => r.recorded).toFixed(2)} | contagem real × taxa do sinal ${sum((r) => r.crossingModel).toFixed(2)} | REAL ${sum((r) => r.actual).toFixed(2)}`);
  console.log(`   erro absoluto médio por sinal vs real: gravado ${mae((r) => r.recorded).toFixed(4)} pp | contagem corrigida ${mae((r) => r.crossingModel).toFixed(4)} pp`);
  const big = rows.filter((r) => Math.abs(r.recorded - r.actual) > 0.02);
  console.log(`   sinais com erro > 0,02 pp: ${big.length} (${(100 * big.length / rows.length).toFixed(0)}%) | maior erro ${Math.max(...rows.map((r) => Math.abs(r.recorded - r.actual))).toFixed(3)} pp`);
  const adj = rows.map((r) => r.net + r.recorded - r.actual);   // PnL líquido se o funding fosse o real
  console.log(`   PnL líquido total: gravado ${sum((r) => r.net).toFixed(2)}% → com funding real ${adj.reduce((x, y) => x + y, 0).toFixed(2)}% | PF ${pf(rows.map((r) => r.net))} → ${pf(adj)}`);
  for (const id of [1, 6, 3]) {
    const sub = rows.filter((r) => r.s.strategyId === id); if (!sub.length) continue;
    console.log(`   #${id} (n=${sub.length}): funding gravado ${sub.reduce((a, r) => a + r.recorded, 0).toFixed(2)} vs real ${sub.reduce((a, r) => a + r.actual, 0).toFixed(2)} pp`);
  }
  const long = rows.filter((r) => r.hold > 24);
  console.log(`   sinais > 24h (n=${long.length}): gravado ${long.reduce((a, r) => a + r.recorded, 0).toFixed(2)} vs real ${long.reduce((a, r) => a + r.actual, 0).toFixed(2)} pp`);
}

main().catch((e) => { console.error('Erro:', e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
