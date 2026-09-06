// Módulo de avaliação estendida (Fase 3) — calcula métricas mais profundas
// que lib/metrics.ts, SEM alterar o comportamento dele: StrategyStats,
// BacktestScan, RadarContextScan, walk-forward e stability-engine continuam
// usando computeMetrics() exatamente como antes. Este módulo é aditivo,
// consumido por scripts/evaluate.ts (e por qualquer rota nova que se queira
// criar depois), nunca escrito de volta nas tabelas existentes.
//
// Regra que perpassa tudo aqui: NUNCA reportar um número sem informar
// junto o tamanho da amostra que o sustenta, e sempre marcar
// `sufficientSample: false` quando a amostra for pequena demais pra dizer
// algo com confiança — os limiares abaixo são convenções conservadoras
// documentadas, não uma prova estatística.
import { ROUNDTRIP_FEES_PERCENT, ASSUMED_SLIPPAGE_PERCENT } from './trading-costs';

// Abaixo disso, nenhuma conclusão de recorte (ativo/timeframe/regime/etc)
// é considerada confiável — só um indício.
export const MIN_SAMPLE_BREAKDOWN = 10;
// Abaixo disso, nem os números "gerais" (profit factor, expectância) do
// escopo completo são marcados como suficientes.
export const MIN_SAMPLE_OVERALL = 20;
// Sharpe/Sortino exigem amostra maior pra desvio-padrão fazer sentido —
// convenção comum (regra de bolso ligada ao teorema central do limite),
// não um valor mágico.
export const MIN_SAMPLE_SHARPE = 30;

export interface EvaluationTrade {
  strategyId: number;
  strategyName: string;
  pair: string;
  timeframe: string;
  direction: string;
  status: string; // 'WIN' | 'LOSS'
  pnlPercent: number | null; // bruto
  pnlNetPercent: number | null; // líquido — pode ser null em sinais fechados antes da Fase 2
  entryPrice: number;
  stopLoss: number;
  confidence: number | null;
  marketRegime: string | null;
  atrRatio: number | null;
  createdAt: Date;
  closedAt: Date | null;
}

export interface SampleFlagged<T> {
  value: T | null;
  sampleSize: number;
  sufficientSample: boolean;
}

export interface ExtendedMetrics {
  totalTrades: number;
  sufficientSample: boolean;
  winRate: number;
  grossProfitPercent: number; // soma dos ganhos brutos (%)
  grossLossPercent: number; // soma (em módulo) das perdas brutas (%)
  netPnlPercent: number; // soma do líquido (com fallback estimado onde faltar)
  netPnlEstimatedCount: number; // quantos trades usaram fallback (sem pnlNetPercent gravado)
  profitFactorGross: number;
  profitFactorNet: number;
  expectancyGross: number; // média por trade, bruto
  expectancyNet: number; // média por trade, líquido
  payoffGross: number; // média ganho / média perda, bruto
  payoffNet: number;
  avgWinGross: number;
  avgLossGross: number;
  maxWinStreak: number;
  maxLossStreak: number;
  maxDrawdownGross: number;
  maxDrawdownNet: number;
  avgRMultipleNet: number | null; // retorno líquido / risco% do trade (stop), em R — null se nenhum trade tinha risco > 0
  rMultipleSampleSize: number;
  sharpeNet: SampleFlagged<number>; // por trade, NÃO anualizado (ver comentário na função)
  sortinoNet: SampleFlagged<number>;
}

export interface BreakdownRow {
  key: string;
  totalTrades: number;
  sufficientSample: boolean;
  winRate: number;
  netPnlPercent: number;
  profitFactorNet: number;
}

export interface EvaluationReport {
  scope: string; // "Combinado (todas as estratégias)" ou nome de uma estratégia
  strategyId: number | null; // null = combinado
  generatedAt: Date;
  overall: ExtendedMetrics;
  byAsset: BreakdownRow[];
  byTimeframe: BreakdownRow[];
  byRegime: BreakdownRow[];
  byVolatility: BreakdownRow[];
  byHourUTC: BreakdownRow[];
  byConfidenceBucket: BreakdownRow[];
  contextDataCoverage: {
    totalTrades: number;
    withRegimeData: number; // quantos têm marketRegime gravado (só sinais pós-Fase 2)
  };
}

// Conversão de uma linha do Prisma (Signal) pro formato que este módulo
// consome — centralizado aqui pra scripts/evaluate.ts e
// lib/circuit-breakers.ts não duplicarem o mesmo mapeamento campo a campo.
export interface SignalLikeRow {
  strategyId: number;
  strategyName: string;
  pair: string;
  timeframe: string;
  direction: string;
  status: string;
  pnlPercent: number | null;
  pnlNetPercent: number | null;
  entryPrice: number;
  stopLoss: number;
  confidence: number | null;
  marketRegime: string | null;
  atrRatio: number | null;
  createdAt: Date;
  closedAt: Date | null;
}

export function signalRowToEvaluationTrade(s: SignalLikeRow): EvaluationTrade {
  return {
    strategyId: s.strategyId,
    strategyName: s.strategyName,
    pair: s.pair,
    timeframe: s.timeframe,
    direction: s.direction,
    status: s.status,
    pnlPercent: s.pnlPercent,
    pnlNetPercent: s.pnlNetPercent,
    entryPrice: s.entryPrice,
    stopLoss: s.stopLoss,
    confidence: s.confidence,
    marketRegime: s.marketRegime,
    atrRatio: s.atrRatio,
    createdAt: s.createdAt,
    closedAt: s.closedAt,
  };
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = avg(nums);
  const variance = nums.reduce((acc, x) => acc + (x - m) ** 2, 0) / (nums.length - 1);
  return Math.sqrt(variance);
}

/**
 * PnL líquido do trade — usa o valor gravado (pnlNetPercent) quando existe;
 * senão estima aplicando só taxa+slippage (sem funding, que não dá pra
 * reconstruir retroativamente sem a taxa de funding no momento do sinal).
 * Isso SUBESTIMA levemente o custo de trades antigos que tiveram funding
 * contra a posição, e superestima os que tiveram funding a favor — é uma
 * aproximação, não o valor real. `wasEstimated` avisa quando isso aconteceu.
 */
function netPnlOf(t: EvaluationTrade): { net: number; wasEstimated: boolean } {
  if (t.pnlNetPercent !== null && t.pnlNetPercent !== undefined) {
    return { net: t.pnlNetPercent, wasEstimated: false };
  }
  const gross = t.pnlPercent ?? 0;
  return { net: gross - ROUNDTRIP_FEES_PERCENT - ASSUMED_SLIPPAGE_PERCENT, wasEstimated: true };
}

function maxDrawdownOf(pnls: number[]): number {
  let equity = 0;
  let peak = 0;
  let maxDD = 0;
  for (const p of pnls) {
    equity += p;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function maxStreak(trades: EvaluationTrade[], status: 'WIN' | 'LOSS'): number {
  let max = 0;
  let cur = 0;
  for (const t of trades) {
    if (t.status === status) {
      cur++;
      if (cur > max) max = cur;
    } else {
      cur = 0;
    }
  }
  return max;
}

export function computeExtendedMetrics(tradesInput: EvaluationTrade[]): ExtendedMetrics {
  // Ordem cronológica — necessário pra sequências (streak) e drawdown fazerem sentido.
  const trades = tradesInput.slice().sort((a, b) => {
    const ta = (a.closedAt ?? a.createdAt).getTime();
    const tb = (b.closedAt ?? b.createdAt).getTime();
    return ta - tb;
  });

  const totalTrades = trades.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      sufficientSample: false,
      winRate: 0,
      grossProfitPercent: 0,
      grossLossPercent: 0,
      netPnlPercent: 0,
      netPnlEstimatedCount: 0,
      profitFactorGross: 0,
      profitFactorNet: 0,
      expectancyGross: 0,
      expectancyNet: 0,
      payoffGross: 0,
      payoffNet: 0,
      avgWinGross: 0,
      avgLossGross: 0,
      maxWinStreak: 0,
      maxLossStreak: 0,
      maxDrawdownGross: 0,
      maxDrawdownNet: 0,
      avgRMultipleNet: null,
      rMultipleSampleSize: 0,
      sharpeNet: { value: null, sampleSize: 0, sufficientSample: false },
      sortinoNet: { value: null, sampleSize: 0, sufficientSample: false },
    };
  }

  const grossPnls = trades.map((t) => t.pnlPercent ?? 0);
  const netResults = trades.map(netPnlOf);
  const netPnls = netResults.map((r) => r.net);
  const netPnlEstimatedCount = netResults.filter((r) => r.wasEstimated).length;

  const wins = trades.filter((t) => t.status === 'WIN');
  const losses = trades.filter((t) => t.status === 'LOSS');
  const winRate = (wins.length / totalTrades) * 100;

  const grossProfitPercent = grossPnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const grossLossPercent = Math.abs(grossPnls.filter((p) => p < 0).reduce((a, b) => a + b, 0));
  const profitFactorGross = grossLossPercent > 0 ? grossProfitPercent / grossLossPercent : grossProfitPercent > 0 ? grossProfitPercent : 0;

  const netProfit = netPnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const netLoss = Math.abs(netPnls.filter((p) => p < 0).reduce((a, b) => a + b, 0));
  const profitFactorNet = netLoss > 0 ? netProfit / netLoss : netProfit > 0 ? netProfit : 0;

  const avgWinGross = wins.length ? avg(wins.map((t) => t.pnlPercent ?? 0)) : 0;
  const avgLossGrossAbs = losses.length ? Math.abs(avg(losses.map((t) => t.pnlPercent ?? 0))) : 0;
  const payoffGross = avgLossGrossAbs > 0 ? avgWinGross / avgLossGrossAbs : avgWinGross > 0 ? avgWinGross : 0;

  const netByStatus = trades.map((t, i) => ({ status: t.status, net: netPnls[i] }));
  const avgWinNet = netByStatus.filter((x) => x.status === 'WIN').length
    ? avg(netByStatus.filter((x) => x.status === 'WIN').map((x) => x.net))
    : 0;
  const avgLossNetAbs = netByStatus.filter((x) => x.status === 'LOSS').length
    ? Math.abs(avg(netByStatus.filter((x) => x.status === 'LOSS').map((x) => x.net)))
    : 0;
  const payoffNet = avgLossNetAbs > 0 ? avgWinNet / avgLossNetAbs : avgWinNet > 0 ? avgWinNet : 0;

  const expectancyGross = avg(grossPnls);
  const expectancyNet = avg(netPnls);

  const maxDrawdownGross = maxDrawdownOf(grossPnls);
  const maxDrawdownNet = maxDrawdownOf(netPnls);

  const maxWinStreak = maxStreak(trades, 'WIN');
  const maxLossStreak = maxStreak(trades, 'LOSS');

  // R-múltiplo: PnL líquido do trade dividido pelo % de risco definido pelo
  // próprio stop (|entrada-stop|/entrada) — não depende de tamanho de
  // posição nem capital, então funciona mesmo sem esses dados por conta.
  const rMultiples: number[] = [];
  trades.forEach((t, i) => {
    const riskPercent = t.entryPrice > 0 ? (Math.abs(t.entryPrice - t.stopLoss) / t.entryPrice) * 100 : 0;
    if (riskPercent > 0) rMultiples.push(netPnls[i] / riskPercent);
  });
  const avgRMultipleNet = rMultiples.length ? avg(rMultiples) : null;

  // Sharpe/Sortino aqui são POR TRADE (média/desvio-padrão dos retornos de
  // cada operação), não anualizados — o sistema não gera um número fixo de
  // trades por ano por combinação, então anualizar exigiria uma premissa
  // adicional que preferimos não inventar. Serve para comparar
  // consistência ENTRE estratégias/recortes deste mesmo relatório, não
  // como um Sharpe de mercado tradicional.
  const netStd = stdDev(netPnls);
  const sharpeValue = netStd > 0 ? avg(netPnls) / netStd : null;
  const downside = netPnls.filter((p) => p < 0);
  const downsideStd = stdDev(downside.length >= 2 ? downside : []);
  const sortinoValue = downsideStd > 0 ? avg(netPnls) / downsideStd : null;

  return {
    totalTrades,
    sufficientSample: totalTrades >= MIN_SAMPLE_OVERALL,
    winRate,
    grossProfitPercent,
    grossLossPercent,
    netPnlPercent: netPnls.reduce((a, b) => a + b, 0),
    netPnlEstimatedCount,
    profitFactorGross,
    profitFactorNet,
    expectancyGross,
    expectancyNet,
    payoffGross,
    payoffNet,
    avgWinGross,
    avgLossGross: avgLossGrossAbs,
    maxWinStreak,
    maxLossStreak,
    maxDrawdownGross,
    maxDrawdownNet,
    avgRMultipleNet,
    rMultipleSampleSize: rMultiples.length,
    sharpeNet: { value: sharpeValue, sampleSize: totalTrades, sufficientSample: totalTrades >= MIN_SAMPLE_SHARPE },
    sortinoNet: { value: sortinoValue, sampleSize: downside.length, sufficientSample: downside.length >= MIN_SAMPLE_SHARPE },
  };
}

function breakdownBy(trades: EvaluationTrade[], keyFn: (t: EvaluationTrade) => string | null): BreakdownRow[] {
  const groups = new Map<string, EvaluationTrade[]>();
  for (const t of trades) {
    const key = keyFn(t);
    if (key === null) continue; // sem dado pra esse recorte — não entra na quebra, não conta como zero
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const rows: BreakdownRow[] = [];
  for (const [key, group] of groups.entries()) {
    const m = computeExtendedMetrics(group);
    rows.push({
      key,
      totalTrades: m.totalTrades,
      sufficientSample: m.totalTrades >= MIN_SAMPLE_BREAKDOWN,
      winRate: m.winRate,
      netPnlPercent: m.netPnlPercent,
      profitFactorNet: m.profitFactorNet,
    });
  }
  // Amostras maiores primeiro — o que tem mais dado por trás vem no topo.
  return rows.sort((a, b) => b.totalTrades - a.totalTrades);
}

function volatilityBucket(atrRatio: number | null): string | null {
  if (atrRatio === null || atrRatio === undefined) return null;
  // Mesmo limiar de expansão de volatilidade usado em lib/regime.ts
  // (VOLATILITY_EXPANSION_RATIO = 1.3), pra ficar consistente com como o
  // resto do sistema já classifica "alta volatilidade".
  if (atrRatio >= 1.3) return 'alta (ATR ratio >= 1.3)';
  if (atrRatio <= 0.8) return 'baixa (ATR ratio <= 0.8)';
  return 'normal (0.8-1.3)';
}

function confidenceBucket(confidence: number | null): string | null {
  if (confidence === null || confidence === undefined) return null;
  // Faixas largas de propósito: hoje a confiança emitida pelas estratégias
  // é um valor quase fixo por estratégia (ex: sempre 70, 75...), não um
  // score dinâmico por sinal — então esta quebra hoje separa muito pouco
  // além do que "por estratégia" já separa. Mantido aqui como estrutura
  // pronta pra quando/se a confiança passar a variar de fato por sinal.
  if (confidence < 60) return '< 60';
  if (confidence < 70) return '60-69';
  if (confidence < 80) return '70-79';
  if (confidence < 90) return '80-89';
  return '>= 90';
}

function hourBucketUTC(t: EvaluationTrade): string {
  const hour = new Date(t.createdAt).getUTCHours();
  const bucket = Math.floor(hour / 2) * 2;
  return `${String(bucket).padStart(2, '0')}:00-${String((bucket + 2) % 24).padStart(2, '0')}:00 UTC`;
}

export function buildEvaluationReport(scope: string, strategyId: number | null, trades: EvaluationTrade[]): EvaluationReport {
  const withRegimeData = trades.filter((t) => t.marketRegime !== null && t.marketRegime !== undefined).length;

  return {
    scope,
    strategyId,
    generatedAt: new Date(),
    overall: computeExtendedMetrics(trades),
    byAsset: breakdownBy(trades, (t) => t.pair),
    byTimeframe: breakdownBy(trades, (t) => t.timeframe),
    byRegime: breakdownBy(trades, (t) => t.marketRegime),
    byVolatility: breakdownBy(trades, (t) => volatilityBucket(t.atrRatio)),
    byHourUTC: breakdownBy(trades, hourBucketUTC),
    byConfidenceBucket: breakdownBy(trades, (t) => confidenceBucket(t.confidence)),
    contextDataCoverage: { totalTrades: trades.length, withRegimeData },
  };
}
