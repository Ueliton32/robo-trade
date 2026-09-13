/**
 * Fase C — Shadow vs Paper Trading Comparison
 *
 * Compara os sinais SHADOW (gerados com regime filter ATIVO para
 * estratégias 1 e 2) versus sinais PAPER_TRADING (sem regime filter)
 * no período de avaliação.
 *
 * Executar: npx tsx --require dotenv/config scripts/shadow-comparison.ts
 */

import { prisma } from '@/lib/prisma';
import { STRATEGY_DEFS } from '@/lib/strategies';

const SHADOW_SOURCE_PREFIX = 'shadow_v';

async function runComparison() {
  console.log('═'.repeat(70));
  console.log('Fase C — Shadow vs Paper Trading Comparison');
  console.log('═'.repeat(70));
  console.log(`Data: ${new Date().toLocaleString('pt-BR')}`);
  console.log('─'.repeat(70));

  // Pega o source tag atual (shadow_v{N})
  const latestShadow = await prisma.signal.findFirst({
    where: { source: { startsWith: SHADOW_SOURCE_PREFIX } },
    orderBy: { createdAt: 'desc' },
    select: { source: true },
  });

  const currentShadowSource = latestShadow?.source ?? 'shadow_v0';
  console.log(`Filtro de regime ATIVO para: estratégias 1 (qualquer TF) e 2 (qualquer TF)`);
  console.log(`Source shadow atual: ${currentShadowSource}`);
  console.log('');

  // Sinais shadow vs PAPER_TRADING no período
  const shadowSignals = await prisma.signal.findMany({
    where: {
      source: currentShadowSource,
      status: 'PENDENTE',
    },
    orderBy: { createdAt: 'desc' },
    select: {
      strategyId: true,
      strategyName: true,
      pair: true,
      direction: true,
      timeframe: true,
      createdAt: true,
      marketRegime: true,
    },
  });

  const paperSignals = await prisma.signal.findMany({
    where: {
      source: { in: ['live', 'PAPER_TRADING'] },
      executionMode: 'PAPER_TRADING',
      status: 'PENDENTE',
      createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      strategyId: true,
      strategyName: true,
      pair: true,
      direction: true,
      timeframe: true,
      createdAt: true,
      marketRegime: true,
    },
  });

  console.log(`Shadow signals encontrados: ${shadowSignals.length}`);
  console.log(`Paper signals (última semana): ${paperSignals.length}`);
  console.log('');

  if (shadowSignals.length === 0) {
    console.log('⚠ Nenhum sinal shadow encontrado. Execute o robô em SHADOW mode para gerar.');
    console.log('');
    console.log('Para ativar SHADOW mode:');
    console.log('  1. Edite .env: EXECUTION_MODE=SHADOW');
    console.log('  2. Reinicie o servidor / agendador');
    console.log('  3. Aguarde o próximo ciclo do scheduler');
    return;
  }

  // Agrupa por strategyId + pair + timeframe
  const shadowGrouped = new Map<string, any>();
  for (const s of shadowSignals) {
    const key = `${s.strategyId}|${s.pair}|${s.timeframe}`;
    let row = shadowGrouped.get(key);
    if (!row) {
      row = {
        strategyId: s.strategyId,
        strategyName: s.strategyName,
        pair: s.pair,
        timeframe: s.timeframe,
        regime: s.marketRegime ?? 'N/A',
        shadowCount: 0,
        paperCount: 0,
        shadowLong: 0,
        shadowShort: 0,
        paperLong: 0,
        paperShort: 0,
      };
      shadowGrouped.set(key, row);
    }
    row.shadowCount++;
    if (s.direction === 'LONG') row.shadowLong++;
    else row.shadowShort++;
  }

  const paperGrouped = new Map<string, any>();
  for (const p of paperSignals) {
    const key = `${p.strategyId}|${p.pair}|${p.timeframe}`;
    let row = paperGrouped.get(key);
    if (!row) {
      row = {
        strategyId: p.strategyId,
        strategyName: p.strategyName,
        pair: p.pair,
        timeframe: p.timeframe,
        regime: p.marketRegime ?? 'N/A',
        shadowCount: 0,
        paperCount: 0,
        shadowLong: 0,
        shadowShort: 0,
        paperLong: 0,
        paperShort: 0,
      };
      paperGrouped.set(key, row);
    }
    row.paperCount++;
    if (p.direction === 'LONG') row.paperLong++;
    else row.paperShort++;
  }

  // Combina
  const allKeys = new Set([...shadowGrouped.keys(), ...paperGrouped.keys()]);
  const combined: any[] = [];
  for (const key of allKeys) {
    const shadowRow = shadowGrouped.get(key);
    const paperRow = paperGrouped.get(key);
    if (shadowRow) combined.push({ ...shadowRow, paperCount: paperRow?.paperCount ?? 0, paperLong: paperRow?.paperLong ?? 0, paperShort: paperRow?.paperShort ?? 0 });
    else if (paperRow) combined.push({ ...paperRow, shadowCount: 0, shadowLong: 0, shadowShort: 0 });
  }

  combined.sort((a, b) => {
    if (a.strategyId !== b.strategyId) return a.strategyId - b.strategyId;
    if (a.pair !== b.pair) return a.pair.localeCompare(b.pair);
    return a.timeframe.localeCompare(b.timeframe);
  });

  // Prints
  console.log('📊 Comparação por estratégia × par × timeframe:');
  console.log('-'.repeat(70));
  console.log(`${'Strat'.padEnd(5)} ${'Par'.padEnd(12)} ${'TF'.padEnd(6)} ${'Regime'.padEnd(24)} ${'Shadow'.padEnd(8)} ${'Paper'.padEnd(8)} ${'L/S Shadow'.padEnd(12)} ${'L/S Paper'.padEnd(12)}`);
  console.log('-'.repeat(70));

  for (const row of combined) {
    const stratName = STRATEGY_DEFS[row.strategyId]?.name ?? `#${row.strategyId}`;
    const lSS = `L:${row.shadowLong} S:${row.shadowShort}`;
    const lSP = `L:${row.paperLong} S:${row.paperShort}`;
    console.log(`${stratName.padEnd(5)} ${row.pair.padEnd(12)} ${row.timeframe.padEnd(6)} ${row.regime.padEnd(24)} ${row.shadowCount.toString().padEnd(8)} ${row.paperCount.toString().padEnd(8)} ${lSS.padEnd(12)} ${lSP.padEnd(12)}`);
  }

  console.log('-'.repeat(70));

  // Resumo por estratégia
  const byStrategy = new Map<number, any>();
  for (const row of combined) {
    let s = byStrategy.get(row.strategyId);
    if (!s) { s = { shadow: 0, paper: 0, shadowLong: 0, shadowShort: 0, paperLong: 0, paperShort: 0 }; byStrategy.set(row.strategyId, s); }
    s.shadow += row.shadowCount;
    s.paper += row.paperCount;
    s.shadowLong += row.shadowLong;
    s.shadowShort += row.shadowShort;
    s.paperLong += row.paperLong;
    s.paperShort += row.paperShort;
  }

  console.log('\n📈 Resumo por estratégia:');
  console.log('-'.repeat(70));
  console.log(`${'Strat'.padEnd(5)} ${'Nome'.padEnd(30)} ${'Shadow Sinais'.padEnd(15)} ${'Paper Sinais'.padEnd(15)} ${'Shadow L/S'.padEnd(14)} ${'Paper L/S'.padEnd(14)}`);
  console.log('-'.repeat(70));

  for (const [sid, data] of byStrategy) {
    const name = STRATEGY_DEFS[sid]?.name ?? `#${sid}`;
    const lSS = `L:${data.shadowLong} S:${data.shadowShort}`;
    const lSP = `L:${data.paperLong} S:${data.paperShort}`;
    console.log(`${sid.toString().padEnd(5)} ${name.padEnd(30)} ${data.shadow.toString().padEnd(15)} ${data.paper.toString().padEnd(15)} ${lSS.padEnd(14)} ${lSP.padEnd(14)}`);
  }
  console.log('-'.repeat(70));

  console.log('\n✅ Diagnóstico concluído.');
  console.log('📌 Próximos passos:');
  console.log('  1. Execute este script DIARIAMENTE durante 2 semanas');
  console.log('  2. Compare shadowCount vs paperCount por estratégia');
  console.log('  3. Se shadow > paper de forma consistente → regime filter vale a pena');
  console.log('  4. Se shadow < paper → regime filter está filtrando sinais bons demais');
  console.log('  5. Após 2 semanas, decidir: manter filtro (Opção B) ou remover (volta à Opção A)');
}

runComparison().catch(console.error);