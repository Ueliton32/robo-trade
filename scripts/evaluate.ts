/**
 * Módulo de avaliação (Fase 3) — relatório de métricas separado por
 * estratégia e combinado, incluindo PnL líquido (taxa+funding+slippage) e
 * quebras por ativo/timeframe/regime/volatilidade/horário/confiança.
 *
 * Usa SOMENTE sinais reais (source = "live") já fechados (WIN ou LOSS) —
 * igual a lib/stats-engine.ts. Não escreve nada no banco; é só leitura +
 * relatório. Os números que já aparecem no dashboard (StrategyStats) não
 * mudam — este script é uma visão adicional, mais profunda, por cima do
 * mesmo dado.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/evaluate.ts
 *   npx tsx --require dotenv/config scripts/evaluate.ts --strategy=2
 *   npx tsx --require dotenv/config scripts/evaluate.ts --json=relatorio.json
 */
import { prisma } from '../lib/prisma';
import { STRATEGY_DEFS } from '../lib/strategies';
import {
  buildEvaluationReport,
  EvaluationTrade,
  EvaluationReport,
  BreakdownRow,
  MIN_SAMPLE_OVERALL,
  MIN_SAMPLE_BREAKDOWN,
  MIN_SAMPLE_SHARPE,
  signalRowToEvaluationTrade,
} from '../lib/metrics-extended';
import * as fs from 'fs';

function argValue(name: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
}

function pct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function sampleTag(sufficient: boolean, n: number): string {
  return sufficient ? `(n=${n})` : `(n=${n} — AMOSTRA INSUFICIENTE, tratar como indício, não conclusão)`;
}

function printBreakdown(title: string, rows: BreakdownRow[]) {
  console.log(`\n  ${title}:`);
  if (!rows.length) {
    console.log('    (sem dado suficiente pra esse recorte)');
    return;
  }
  for (const r of rows) {
    const flag = r.sufficientSample ? '' : '  ⚠️ amostra pequena';
    console.log(
      `    ${r.key.padEnd(28)} n=${String(r.totalTrades).padEnd(4)} winRate=${r.winRate.toFixed(0).padStart(3)}%  PF líq=${r.profitFactorNet.toFixed(2).padStart(5)}  PnL líq=${pct(r.netPnlPercent).padStart(9)}${flag}`
    );
  }
}

function printReport(report: EvaluationReport) {
  const m = report.overall;
  console.log('\n' + '═'.repeat(78));
  console.log(`  ${report.scope}`);
  console.log('═'.repeat(78));

  if (m.totalTrades === 0) {
    console.log('  Nenhum sinal real fechado (WIN/LOSS) ainda — nada pra avaliar.');
    return;
  }

  console.log(`  Total de trades fechados: ${m.totalTrades} ${sampleTag(m.sufficientSample, m.totalTrades)}`);
  if (m.netPnlEstimatedCount > 0) {
    console.log(
      `  ⚠️  ${m.netPnlEstimatedCount} desses trades são de antes da Fase 2 (sem custo real gravado) — ` +
      `o líquido deles foi ESTIMADO (só taxa+slippage, sem funding real).`
    );
  }
  console.log(`  Taxa de acerto: ${m.winRate.toFixed(1)}%`);
  console.log('');
  console.log('  ── Bruto (sem custos) ──────────────  ── Líquido (com taxa/funding/slippage) ──');
  console.log(`  Lucro bruto:      ${pct(m.grossProfitPercent).padStart(10)}         Profit factor líq: ${m.profitFactorNet.toFixed(2)}`);
  console.log(`  Prejuízo bruto:   ${pct(-m.grossLossPercent).padStart(10)}         PnL líquido total: ${pct(m.netPnlPercent)}`);
  console.log(`  Profit factor:    ${m.profitFactorGross.toFixed(2).padStart(10)}         Expectância líq:   ${pct(m.expectancyNet)}/trade`);
  console.log(`  Expectância:      ${pct(m.expectancyGross).padStart(10)}/trade  Payoff líquido:    ${m.payoffNet.toFixed(2)}`);
  console.log(`  Payoff:           ${m.payoffGross.toFixed(2).padStart(10)}         Drawdown máx líq:  ${pct(-m.maxDrawdownNet)}`);
  console.log(`  Ganho médio:      ${pct(m.avgWinGross).padStart(10)}`);
  console.log(`  Perda média:      ${pct(-m.avgLossGross).padStart(10)}`);
  console.log(`  Drawdown máx:     ${pct(-m.maxDrawdownGross).padStart(10)}`);
  console.log(`  Seq. de ganhos:   ${String(m.maxWinStreak).padStart(10)}`);
  console.log(`  Seq. de perdas:   ${String(m.maxLossStreak).padStart(10)}`);

  if (m.avgRMultipleNet !== null) {
    console.log(`\n  Retorno por unidade de risco (R líquido médio): ${m.avgRMultipleNet.toFixed(2)}R ${sampleTag(m.rMultipleSampleSize >= MIN_SAMPLE_OVERALL, m.rMultipleSampleSize)}`);
  }

  if (m.sharpeNet.value !== null) {
    console.log(`  Sharpe por trade (não anualizado): ${m.sharpeNet.value.toFixed(2)} ${sampleTag(m.sharpeNet.sufficientSample, m.sharpeNet.sampleSize)}`);
  } else {
    console.log(`  Sharpe por trade: não aplicável (desvio-padrão zero ou amostra insuficiente, mínimo ${MIN_SAMPLE_SHARPE})`);
  }
  if (m.sortinoNet.value !== null) {
    console.log(`  Sortino por trade (não anualizado): ${m.sortinoNet.value.toFixed(2)} ${sampleTag(m.sortinoNet.sufficientSample, m.sortinoNet.sampleSize)}`);
  } else {
    console.log(`  Sortino por trade: não aplicável (sem perdas suficientes pra desvio-padrão, mínimo ${MIN_SAMPLE_SHARPE})`);
  }

  printBreakdown('Por ativo', report.byAsset);
  printBreakdown('Por timeframe', report.byTimeframe);
  printBreakdown('Por regime de mercado', report.byRegime);
  printBreakdown('Por volatilidade (ATR ratio)', report.byVolatility);
  printBreakdown('Por horário (UTC)', report.byHourUTC);
  printBreakdown('Por faixa de confiança', report.byConfidenceBucket);

  const pctWithContext = report.contextDataCoverage.totalTrades
    ? (report.contextDataCoverage.withRegimeData / report.contextDataCoverage.totalTrades) * 100
    : 0;
  console.log(
    `\n  Cobertura de contexto: ${report.contextDataCoverage.withRegimeData}/${report.contextDataCoverage.totalTrades} trades (${pctWithContext.toFixed(0)}%) têm regime/volatilidade gravados.`
  );
  if (pctWithContext < 100) {
    console.log(
      '  (Os demais são anteriores à Fase 2 de registro, de 04/09/2026 — não entram nas quebras por regime/volatilidade, só nos números gerais.)'
    );
  }
}

async function loadTrades(strategyId?: number): Promise<EvaluationTrade[]> {
  const signals = await prisma.signal.findMany({
    where: {
      source: 'live',
      status: { in: ['WIN', 'LOSS'] },
      ...(strategyId ? { strategyId } : {}),
    },
    orderBy: { closedAt: 'asc' },
  });

  return signals.map(signalRowToEvaluationTrade);
}

async function main() {
  const strategyArg = argValue('strategy');
  const jsonPath = argValue('json');
  const reports: EvaluationReport[] = [];

  console.log(`Limiares de amostra: geral >= ${MIN_SAMPLE_OVERALL}, quebra por recorte >= ${MIN_SAMPLE_BREAKDOWN}, Sharpe/Sortino >= ${MIN_SAMPLE_SHARPE}.`);

  if (strategyArg) {
    const strategyId = parseInt(strategyArg, 10);
    const strat = STRATEGY_DEFS.find((s) => s.id === strategyId);
    if (!strat) {
      console.error(`Estratégia ${strategyArg} não encontrada. IDs válidos: ${STRATEGY_DEFS.map((s) => s.id).join(', ')}`);
      process.exit(1);
      return;
    }
    const trades = await loadTrades(strategyId);
    const report = buildEvaluationReport(strat.name, strat.id, trades);
    printReport(report);
    reports.push(report);
  } else {
    const allTrades = await loadTrades();
    const combined = buildEvaluationReport('Combinado (todas as estratégias)', null, allTrades);
    printReport(combined);
    reports.push(combined);

    for (const strat of STRATEGY_DEFS) {
      const trades = allTrades.filter((t) => t.strategyId === strat.id);
      const report = buildEvaluationReport(strat.name, strat.id, trades);
      printReport(report);
      reports.push(report);
    }
  }

  if (jsonPath) {
    fs.writeFileSync(jsonPath, JSON.stringify(reports, null, 2));
    console.log(`\nRelatório completo salvo em ${jsonPath}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[evaluate] Falha:', e?.message ?? e);
    process.exit(1);
  });
