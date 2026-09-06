// Limites de risco (Fase 8, 04/09/2026) — circuit breakers GLOBAIS,
// configuráveis por variável de ambiente, com valores padrão
// conservadores escolhidos por mim como ponto de partida razoável, não
// validados estatisticamente pro seu caso — ajuste no seu .env conforme
// seu apetite a risco. NUNCA ajustados automaticamente pelo sistema em
// tempo de execução — só por você, editando o .env e reiniciando.
//
// Importante sobre a unidade dos limites de perda/drawdown: são em
// "pontos percentuais somados por sinal" — a mesma unidade que
// StrategyStats e lib/metrics-extended.ts já usam no resto do sistema
// (soma do %PnL de cada sinal fechado, não um % real do seu patrimônio,
// já que o robô não sabe seu capital nem o tamanho de posição real de
// cada operação). Trate como um termômetro relativo de "quanto a
// combinação de sinais recentes se moveu contra", não uma cifra em
// dinheiro.
function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Soma do PnL líquido dos sinais fechados HOJE (00:00 UTC até agora) cair
// abaixo de -X% dispara o breaker "daily_loss".
export const RISK_MAX_DAILY_LOSS_PERCENT = envFloat('RISK_MAX_DAILY_LOSS_PERCENT', 5);
// Mesma ideia, últimos 7 dias corridos — breaker "weekly_loss".
export const RISK_MAX_WEEKLY_LOSS_PERCENT = envFloat('RISK_MAX_WEEKLY_LOSS_PERCENT', 12);
// Drawdown líquido máximo (pico a vale, na curva de PnL somado) dentro da
// janela abaixo — breaker "max_drawdown".
export const RISK_MAX_DRAWDOWN_PERCENT = envFloat('RISK_MAX_DRAWDOWN_PERCENT', 20);
export const RISK_MAX_DRAWDOWN_LOOKBACK_DAYS = envInt('RISK_MAX_DRAWDOWN_LOOKBACK_DAYS', 90);
// Sequência de N perdas seguidas (entre TODAS as estratégias/pares, na
// ordem em que fecharam) dispara o breaker "loss_streak".
export const RISK_MAX_CONSECUTIVE_LOSSES = envInt('RISK_MAX_CONSECUTIVE_LOSSES', 8);
// N ciclos do agendador falhando seguidos dispara o breaker
// "api_failures" (reaproveita o contador que já existe em
// lib/cycle-runner.ts pra alerta — aqui também bloqueia geração).
export const RISK_MAX_CONSECUTIVE_CYCLE_FAILURES = envInt('RISK_MAX_CONSECUTIVE_CYCLE_FAILURES', 6);

// Exposição — estes dois NÃO exigem reset manual (autocorrigem conforme
// sinal pendente fecha): número máximo de sinais PENDENTE simultâneos
// por par, e no total do sistema.
export const RISK_MAX_OPEN_SIGNALS_PER_PAIR = envInt('RISK_MAX_OPEN_SIGNALS_PER_PAIR', 3);
export const RISK_MAX_OPEN_SIGNALS_TOTAL = envInt('RISK_MAX_OPEN_SIGNALS_TOTAL', 25);

// Teto absoluto pra alavancagem SUGERIDA em qualquer sinal novo — aplicado
// por cima do que lib/strategies.ts já sugere por tier de volatilidade
// (nunca aumenta, só pode reduzir). Puramente informativo hoje (o robô
// não executa ordem), mas já deixa a trava pronta caso isso mude no
// futuro — sem execução real, isso nunca acontece sozinho (Fase 9).
export const RISK_MAX_LEVERAGE_CAP = envInt('RISK_MAX_LEVERAGE_CAP', 20);
