import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== RadarContextScan — Estratégia 1: análise completa ===\n');

  const scans = await prisma.radarContextScan.findMany({
    where: { strategyId: 1, months: 3 },
    orderBy: { filteredPF: 'desc' },
    select: {
      pair: true, timeframe: true,
      totalDetected: true, totalAccepted: true,
      unfilteredTrades: true, unfilteredWinRate: true, unfilteredPF: true, unfilteredExp: true,
      filteredTrades: true, filteredPF: true, filteredWinRate: true, filteredExp: true,
    },
  });

  const dados = scans.filter(s => s.unfilteredTrades >= 10 && s.filteredTrades >= 5);

  console.log(`Combos com dados suficientes: ${dados.length}/${scans.length}`);
  console.log('');

  const avgUnf = dados.reduce((a, s) => a + s.unfilteredPF, 0) / dados.length;
  const avgFilt = dados.reduce((a, s) => a + s.filteredPF, 0) / dados.length;

  console.log('AGREGADO:');
  console.log(`  PF médio sozinho:  ${avgUnf.toFixed(2)}`);
  console.log(`  PF médio filtrado: ${avgFilt.toFixed(2)}`);
  console.log(`  Delta: ${(avgFilt - avgUnf).toFixed(2)}`);
  console.log('');

  // Agrupado por timeframe
  console.log('POR TIMEFRAME:');
  const porTF: Record<string, { unf: number[]; filt: number[]; delta: number[] }> = {};
  for (const s of dados) {
    if (!porTF[s.timeframe]) porTF[s.timeframe] = { unf: [], filt: [], delta: [] };
    porTF[s.timeframe].unf.push(s.unfilteredPF);
    porTF[s.timeframe].filt.push(s.filteredPF);
    porTF[s.timeframe].delta.push(s.filteredPF - s.unfilteredPF);
  }
  for (const [tf, vals] of Object.entries(porTF)) {
    const avgUn = vals.unf.reduce((a, x) => a + x, 0) / vals.unf.length;
    const avgFi = vals.filt.reduce((a, x) => a + x, 0) / vals.filt.length;
    const avgD = vals.delta.reduce((a, x) => a + x, 0) / vals.delta.length;
    console.log(`  ${tf}: sozinho PF=${avgUn.toFixed(2)} → filtrado PF=${avgFi.toFixed(2)} (delta ${avgD > 0 ? '+' : ''}${avgD.toFixed(2)}) — ${vals.delta.filter(d => d > 0).length}v${vals.delta.filter(d => d < 0).length}`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERRO:', e?.message || e);
  process.exit(1);
});
