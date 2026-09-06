// Modos de execução (Fase 9, 05/09/2026) — formaliza como um conceito
// explícito no sistema, em vez de deixar implícito no código, o que o
// robô está fazendo em cada momento: BACKTEST, REPLAY, SHADOW,
// PAPER_TRADING ou LIVE.
//
// Como cada modo se realiza DE VERDADE neste projeto (leia antes de supor
// que "modo X" significa "roda o pipeline ao vivo com a flag X"):
//
//   BACKTEST — já existe, sem mudança nenhuma aqui: lib/backtest-engine.ts
//     e scripts/backtest-scan.ts. Simula a detecção pura de cada
//     estratégia contra o histórico real de candles. Não passa pelos
//     pesos (Fase 7), pelo modelo ML (Fase 6) nem pelos circuit breakers
//     (Fase 8) — de propósito, porque esses três dependem de estado real
//     (sinais pendentes de verdade, histórico recente de fechamentos
//     reais) que não existe rodando contra o passado.
//
//   REPLAY — deliberadamente NÃO implementado como "rodar o pipeline
//     completo (pesos+ML+circuit breakers) contra histórico". Os limites
//     de exposição e os circuit breakers (Fase 8) são inerentemente sobre
//     estado real em tempo real (quantos sinais estão pendentes agora,
//     PnL real dos últimos dias) — replayar isso exigiria simular uma
//     conta e um histórico de pendências inteiros e fictícios em paralelo,
//     um projeto bem maior e mais arriscado de acertar (um replay
//     sutilmente errado, mas convincente, é pior que não ter replay).
//     O que já existe e cobre boa parte do valor pretendido:
//     lib/radar-context-backtest.ts (estratégia + filtro de regime contra
//     histórico) e lib/ml-training-data.ts (estratégia + regime + vetor de
//     features completo contra histórico, sem risco-management). Se um dia
//     fizer sentido ir além disso, é uma decisão e um design à parte,
//     discutidos explicitamente — não uma extensão natural deste arquivo.
//
//   SHADOW — implementado de verdade aqui: roda o pipeline ao vivo
//     COMPLETO (enriquecimento, peso, modelo ML, avaliação de circuit
//     breaker) em tempo real, exatamente como PAPER_TRADING, mas o sinal
//     resultante NUNCA é salvo nem notificado (ver saveNewSignals em
//     lib/analysis-engine.ts) — só aparece no log do ciclo. Serve pra
//     observar "o que o robô geraria agora" sem misturar nada no
//     histórico real usado por métricas, pesos e circuit breakers.
//
//   PAPER_TRADING — o comportamento padrão de sempre, agora com nome
//     explícito. O robô já opera só em papel/simulado (nunca envia ordem
//     real) desde antes da Fase 9 existir.
//
//   LIVE — bloqueado de propósito. Este robô não tem (e a Fase 9 não
//     adiciona) nenhum código de envio de ordem real pra exchange nenhuma
//     — sem isso, "modo LIVE" não pode significar operação real, só um
//     estado inválido. Configurar EXECUTION_MODE=LIVE PAUSA a geração de
//     sinal com um erro claro (nunca cai silenciosamente pra
//     PAPER_TRADING, que seria mais arriscado de passar despercebido).
//     Ligar operação real de verdade exigiria um projeto separado,
//     discutido explicitamente com o usuário — chaves de API, envio de
//     ordem, tratamento de erro de execução.
export type ExecutionMode = 'BACKTEST' | 'REPLAY' | 'SHADOW' | 'PAPER_TRADING' | 'LIVE';

export const ALL_EXECUTION_MODES: ExecutionMode[] = ['BACKTEST', 'REPLAY', 'SHADOW', 'PAPER_TRADING', 'LIVE'];

// Modos que a variável de ambiente EXECUTION_MODE pode de fato selecionar
// pro pipeline ao vivo (agendador, rota de cron, "Analisar Agora" manual).
// BACKTEST e REPLAY são ferramentas separadas, disparadas por script
// próprio — não fazem sentido como um "modo" que o pipeline contínuo
// alterna via env var.
const LIVE_PIPELINE_SELECTABLE_MODES: ExecutionMode[] = ['PAPER_TRADING', 'SHADOW', 'LIVE'];

/**
 * Lê o modo configurado via env var EXECUTION_MODE. Qualquer valor
 * ausente, vazio, ou que não seja um dos 3 modos que o pipeline ao vivo
 * aceita (PAPER_TRADING/SHADOW/LIVE) cai no padrão seguro PAPER_TRADING —
 * nunca no sentido contrário (nunca defaulta pra algo mais arriscado por
 * causa de um valor mal digitado).
 */
export function getConfiguredExecutionMode(): ExecutionMode {
  const raw = (process.env.EXECUTION_MODE ?? 'PAPER_TRADING').trim().toUpperCase();
  return LIVE_PIPELINE_SELECTABLE_MODES.includes(raw as ExecutionMode) ? (raw as ExecutionMode) : 'PAPER_TRADING';
}

/**
 * Chamado no início de generateSignals() — se o modo configurado for
 * LIVE, lança um erro claro e PARA a geração de sinal deste ciclo (o
 * mesmo tratamento de falha de ciclo que já existe pra qualquer outro
 * erro em lib/cycle-runner.ts: loga, alerta, conta pra circuit breaker de
 * falhas consecutivas se persistir). Nunca ignora silenciosamente.
 */
export function assertLiveExecutionNotAttempted(mode: ExecutionMode): void {
  if (mode !== 'LIVE') return;
  throw new Error(
    'EXECUTION_MODE=LIVE, mas este robô não tem (de propósito) nenhum código de envio de ordem real — ele só gera e registra sinais, nunca executa nada numa exchange de verdade. ' +
    'Operar com capital real exigiria um projeto separado, com decisão explícita do usuário (chaves de API, envio de ordem, tratamento de erro de execução) — não pode ligar só configurando uma env var. ' +
    'Geração de sinal pausada até EXECUTION_MODE voltar pra PAPER_TRADING (ou SHADOW). Ver lib/execution-mode.ts.'
  );
}

export function isShadowMode(mode: ExecutionMode): boolean {
  return mode === 'SHADOW';
}
