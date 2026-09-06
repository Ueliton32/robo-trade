/**
 * Reset manual de um circuit breaker de risco (Fase 8) — os breakers
 * (perda diária/semanal, drawdown máximo, sequência de perdas, falhas de
 * API seguidas) NUNCA se destravam sozinhos, por design (ver
 * lib/circuit-breakers.ts). Este script é o único jeito de destravar um,
 * e exige uma nota explicando por quê — fica registrado pra sempre no
 * RiskCircuitBreaker e no PilotActionLog.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/reset-circuit-breaker.ts --list
 *   npx tsx --require dotenv/config scripts/reset-circuit-breaker.ts --key=daily_loss --note="Revisado, ok pra retomar"
 */
import { prisma } from '../lib/prisma';
import { logPilotEvent } from '../lib/pilot-log';
import { notifyOps } from '../lib/ops-notify';
import { BREAKER_KEYS } from '../lib/circuit-breakers';

function argValue(name: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function listBreakers() {
  const all = await prisma.riskCircuitBreaker.findMany();
  const byKey = new Map(all.map((r) => [r.key, r]));

  console.log('Circuit breakers de risco:\n');
  for (const key of BREAKER_KEYS) {
    const row = byKey.get(key);
    if (!row || !row.tripped) {
      console.log(`  ${key.padEnd(14)} — OK (não disparado)`);
    } else {
      console.log(`  ${key.padEnd(14)} — 🛑 DISPARADO em ${row.trippedAt?.toISOString()}`);
      console.log(`    Motivo: ${row.reason}`);
    }
  }
}

async function main() {
  const key = argValue('key');

  if (hasFlag('list') || !key) {
    await listBreakers();
    if (!key) console.log('\nPra resetar um: --key=<nome> --note="motivo do reset" (nota obrigatória).');
    return;
  }

  if (!BREAKER_KEYS.includes(key as any)) {
    console.error(`Chave inválida "${key}". Válidas: ${BREAKER_KEYS.join(', ')}`);
    process.exit(1);
    return;
  }

  const note = argValue('note');
  if (!note) {
    console.error('Reset exige --note="motivo" — fica registrado no histórico. Ex: --note="Revisado manualmente, ok pra retomar."');
    process.exit(1);
    return;
  }

  const row = await prisma.riskCircuitBreaker.findUnique({ where: { key } });
  if (!row || !row.tripped) {
    console.log(`"${key}" já não está disparado — nada pra resetar.`);
    return;
  }

  await prisma.riskCircuitBreaker.update({
    where: { key },
    data: { tripped: false, resetAt: new Date(), resetNote: note },
  });
  await logPilotEvent('CIRCUIT_BREAKER_RESET', `Circuit breaker "${key}" resetado manualmente. Nota: ${note}`);
  await notifyOps(
    `✅ <b>Circuit breaker resetado: ${key}</b>\n\n${note}\n\nGeração de sinal novo liberada (se nenhum outro breaker estiver ativo).`
  );
  console.log(`"${key}" resetado. Rode --list pra conferir se algum outro breaker ainda está ativo.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[reset-circuit-breaker] Falha:', e?.message ?? e);
    process.exit(1);
  });
