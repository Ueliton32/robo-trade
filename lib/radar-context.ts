import { MarketRegime, RegimeClassification } from './regime';

/**
 * Mapa gatilho validado → em quais regimes ele faz sentido disparar.
 *
 * Atualizado em 11/08/2026 (ETH e SOL, 6 estratégias) e 12/08/2026 (scan
 * de 100 moedas confirmando ou derrubando cada hipótese com amostra
 * grande):
 *
 *   - Pullback na EMA20 (2): confirmado, melhora ou mantém o resultado.
 *     Em produção (ver REGIME_GATED_STRATEGIES_LIVE em lib/analysis-engine.ts).
 *
 *   - Reversão após Liquidação (5): o filtro de ATR esticado (testado em
 *     11-12/08) foi na direção ERRADA — com 100 moedas de amostra, ele
 *     aceitava só 18,8% dos sinais (562 de 2.982) e o resultado filtrado
 *     não era melhor que o descartado. O gatilho SOZINHO, sem filtro
 *     nenhum, já é a melhor estratégia do projeto (PF médio 1,48 em 5m,
 *     63,5% das moedas testadas lucrativas). Sem filtro de regime a partir
 *     de 12/08/2026 — fica liberada em qualquer regime.
 *
 *   - Trap de Liquidez (3): piorou o resultado nos testes. Removida do
 *     esquema por enquanto — precisa de investigação própria antes de
 *     voltar aqui.
 */
export const REGIME_TRIGGER_MAP: Record<MarketRegime, number[]> = {
  LATERALIZACAO: [1, 6, 5],
  ALTA_CORRECAO: [2, 5],
  BAIXA_CORRECAO: [2, 5],
  ALTA_VOLATILIDADE_SEM_DIRECAO: [5],
  ALTA: [4, 5],
  BAIXA: [4, 5],
};

export function regimeAllowsStrategy(classification: RegimeClassification, strategyId: number): boolean {
  return (REGIME_TRIGGER_MAP[classification.regime] ?? []).includes(strategyId);
}
