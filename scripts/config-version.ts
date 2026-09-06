/**
 * CLI do histórico versionado de configuração (Fase 10). Toda mudança em
 * quais estratégias/pares rodam ao vivo fica registrada aqui — pra saber
 * "o que era antes" e pra poder desfazer sem precisar lembrar de cabeça.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/config-version.ts --users
 *   npx tsx --require dotenv/config scripts/config-version.ts --baseline
 *   npx tsx --require dotenv/config scripts/config-version.ts --list --user=<id>
 *   npx tsx --require dotenv/config scripts/config-version.ts --show --user=<id> --version=<n>
 *   npx tsx --require dotenv/config scripts/config-version.ts --rollback --user=<id> --version=<n> --note="motivo"
 */
import { prisma } from '../lib/prisma';
import { ensureBaselineVersion, listVersions, rollbackToVersion } from '../lib/config-promotion';

function argValue(name: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function cmdUsers() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true } });
  console.log('Usuários (use o id em --user=<id>):\n');
  for (const u of users) console.log(`  ${u.id}  ${u.email ?? '(sem e-mail)'}  ${u.name ?? ''}`);
}

async function cmdBaseline() {
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const u of users) {
    try {
      const result = await ensureBaselineVersion(u.id);
      console.log(result.created ? `Usuário ${u.id}: baseline criada (v${result.version}).` : `Usuário ${u.id}: já tinha histórico (última versão v${result.version}) — nada feito.`);
    } catch (e: any) {
      console.log(`Usuário ${u.id}: pulado (${e?.message ?? e}).`);
    }
  }
}

function fmtSnapshot(v: any): string {
  const pairStrategies = v.pairStrategies ? JSON.stringify(v.pairStrategies) : '(nenhum override por par)';
  return (
    `  Pares monitorados: ${(v.monitoredPairs as string[]).join(', ')}\n` +
    `  Estratégias padrão (global): [${(v.enabledStrategies as number[]).join(',')}]\n` +
    `  Overrides por par: ${pairStrategies}`
  );
}

async function cmdList() {
  const userId = argValue('user');
  if (!userId) {
    console.error('Use --list --user=<id> (rode --users pra achar o id).');
    process.exit(1);
    return;
  }
  const versions = await listVersions(userId, 30);
  if (!versions.length) {
    console.log('Nenhuma versão registrada ainda pra esse usuário — rode --baseline primeiro.');
    return;
  }
  console.log(`Histórico de configuração — usuário ${userId} (mais recente primeiro):\n`);
  for (const v of versions) {
    const tag = v.rolledBackFrom ? ` (rollback → v${v.rolledBackFrom})` : '';
    console.log(`v${v.version} — ${v.createdAt.toISOString()} — via: ${v.changedVia}${tag}`);
    console.log(`  Motivo: ${v.reason}`);
  }
}

async function cmdShow() {
  const userId = argValue('user');
  const versionArg = argValue('version');
  if (!userId || !versionArg) {
    console.error('Use --show --user=<id> --version=<n>.');
    process.exit(1);
    return;
  }
  const v = await prisma.configVersion.findUnique({ where: { userId_version: { userId, version: parseInt(versionArg, 10) } } });
  if (!v) {
    console.error(`Versão ${versionArg} não encontrada pro usuário ${userId}.`);
    process.exit(1);
    return;
  }
  console.log(`v${v.version} — ${v.createdAt.toISOString()} — via: ${v.changedVia}`);
  console.log(`Motivo: ${v.reason}\n`);
  console.log(fmtSnapshot(v));
}

async function cmdRollback() {
  const userId = argValue('user');
  const versionArg = argValue('version');
  const note = argValue('note');
  if (!userId || !versionArg || !note) {
    console.error('Use --rollback --user=<id> --version=<n> --note="motivo do rollback".');
    process.exit(1);
    return;
  }
  const result = await rollbackToVersion({ userId, targetVersion: parseInt(versionArg, 10), note });
  console.log(`Rollback aplicado — nova versão v${result.version} (conteúdo igual ao de v${versionArg}). Reinicia no próximo ciclo, sem precisar reiniciar processo nenhum.`);
}

async function main() {
  if (hasFlag('users')) return cmdUsers();
  if (hasFlag('baseline')) return cmdBaseline();
  if (hasFlag('show')) return cmdShow();
  if (hasFlag('rollback')) return cmdRollback();
  return cmdList();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[config-version] Falha:', e?.message ?? e);
    process.exit(1);
  });
