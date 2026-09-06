// Chaves usadas em SystemState (tabela genérica de estado do sistema) —
// centralizadas aqui pra lib/cycle-runner.ts e lib/circuit-breakers.ts
// concordarem no mesmo nome sem um importar do outro. Isso evita import
// circular: analysis-engine.ts (importado por cycle-runner.ts) também
// importa circuit-breakers.ts, então circuit-breakers.ts não pode
// importar cycle-runner.ts diretamente.
export const HEARTBEAT_STATE_KEY = 'last_cycle_heartbeat';
export const CONSECUTIVE_FAILURES_STATE_KEY = 'consecutive_cycle_failures';
