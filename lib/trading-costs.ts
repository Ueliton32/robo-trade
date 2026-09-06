// Premissas de custo compartilhadas entre o backtest (lib/backtest-engine.ts)
// e o registro de sinais reais fechados (lib/stats-engine.ts), pra garantir
// que os dois calculam PnL líquido do MESMO jeito e continuam comparáveis
// (lib/divergence-check.ts depende disso pra comparar profit factor ao vivo
// vs backtest de forma justa). Antes deste arquivo existir, só o backtest
// descontava taxa/slippage do PnL — sinais reais fechados guardavam só o
// PnL bruto, sem custo nenhum, o que inflava artificialmente o resultado
// "real" exibido no dashboard.
//
// São estimativas conservadoras, não uma contabilidade exata de conta real
// — o robô nunca executa ordem (ver README). Ajuste aqui se quiser refletir
// sua própria faixa de taxa (VIP, desconto em BNB, etc.).

// Taxa de entrada + saída assumida por operação (taker+taker na Binance
// Futures seria ~0,08%; usamos 0,1% de margem). Mantido no MESMO valor que
// o backtest já usava antes deste arquivo existir, de propósito, pra não
// mudar retroativamente o significado de comparações já feitas
// (BacktestScan, RadarContextScan, divergence-check).
export const ROUNDTRIP_FEES_PERCENT = 0.1;

// Slippage estimado separadamente da taxa acima. Hoje fica em 0 (não
// estimado de forma independente ainda) — existe como campo próprio pra
// permitir refinar isso depois (ex: a partir de dados reais de order book)
// sem precisar mudar o schema de novo. Deixe em 0 até ter uma base real
// pra outro valor; não é seguro inventar um número.
export const ASSUMED_SLIPPAGE_PERCENT = 0;

// Funding na Binance Futures é cobrado/pago a cada 8h (00:00, 08:00, 16:00
// UTC) enquanto a posição está aberta.
const FUNDING_INTERVAL_HOURS = 8;

/**
 * Estimativa de custo de funding durante a operação. NÃO é exata: só temos
 * a taxa de funding no momento do SINAL (fundingRateAtSignal), e a taxa
 * real muda a cada janela de 8h enquanto a posição segue aberta — isto
 * assume a mesma taxa do momento do sinal em todas as janelas até o
 * fechamento. Razoável pra operações curtas (a maioria fecha em horas),
 * mas fica menos preciso quanto mais tempo a operação demora pra fechar.
 *
 * Convenção Binance: taxa positiva = LONG paga, SHORT recebe. Retorna em
 * pontos percentuais de PnL (positivo = custo pro lado da posição).
 */
export function estimateFundingCostPercent(params: {
  direction: 'LONG' | 'SHORT' | string;
  fundingRateAtSignal: number | null | undefined;
  entryTime: Date;
  exitTime: Date;
}): number {
  const { direction, fundingRateAtSignal, entryTime, exitTime } = params;
  if (fundingRateAtSignal === null || fundingRateAtSignal === undefined) return 0;

  const holdingHours = Math.max(0, (exitTime.getTime() - entryTime.getTime()) / (1000 * 60 * 60));
  const periodsElapsed = Math.floor(holdingHours / FUNDING_INTERVAL_HOURS);
  if (periodsElapsed <= 0) return 0;

  // fundingRate vem como fração (ex: 0.0001 = 0.01%); convertido pra pontos
  // percentuais, igual aos outros campos de custo.
  const ratePercentPerPeriod = fundingRateAtSignal * 100;
  const sign = direction === 'SHORT' ? -1 : 1;
  return ratePercentPerPeriod * periodsElapsed * sign;
}

export interface NetPnlBreakdown {
  pnlGrossPercent: number;
  feesPercent: number;
  slippagePercent: number;
  fundingCostPercent: number;
  pnlNetPercent: number;
}

/**
 * PnL líquido = PnL bruto (já calculado pela resolução alvo/stop) menos
 * taxa, slippage estimado e funding estimado. Usado tanto no fechamento de
 * sinais reais (lib/stats-engine.ts) quanto poderia ser usado no backtest —
 * o backtest hoje já aplica ROUNDTRIP_FEES_PERCENT direto no PnL simulado,
 * então não chama esta função (evita descontar a mesma taxa duas vezes).
 */
export function computeNetPnl(params: {
  pnlGrossPercent: number;
  direction: 'LONG' | 'SHORT' | string;
  fundingRateAtSignal: number | null | undefined;
  entryTime: Date;
  exitTime: Date;
}): NetPnlBreakdown {
  const fundingCostPercent = estimateFundingCostPercent(params);
  const pnlNetPercent =
    params.pnlGrossPercent - ROUNDTRIP_FEES_PERCENT - ASSUMED_SLIPPAGE_PERCENT - fundingCostPercent;
  return {
    pnlGrossPercent: params.pnlGrossPercent,
    feesPercent: ROUNDTRIP_FEES_PERCENT,
    slippagePercent: ASSUMED_SLIPPAGE_PERCENT,
    fundingCostPercent,
    pnlNetPercent,
  };
}
