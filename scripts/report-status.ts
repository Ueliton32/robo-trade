/**
 * Painel de status consolidado do robô (Fase 11, 05/09/2026) — visão
 * completa sob demanda de tudo que as Fases 6-10 adicionaram, sem
 * precisar rodar `npm run risk:reset -- --list`, `npm run ml:model --
 * --list`, `npm run weights:recompute -- --dry-run` e `npm run
 * config:version -- --list --user=<id>` separadamente. Só lê — nunca
 * muda nada. Ver lib/robot-status-report.ts pro cálculo compartilhado
 * com o resumo semanal automático (lib/weekly-digest.ts).
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/report-status.ts
 *   (ou, via package.json: npm run report:status)
 */
import { prisma } from '../lib/prisma';
import { buildRobotStatusReport, formatStatusReportText } from '../lib/robot-status-report';

async function main() {
  const report = await buildRobotStatusReport();

  console.log('='.repeat(70));
  console.log('STATUS DO ROBÔ — visão consolidada (Fase 11)');
  console.log(`Gerado em ${new Date().toISOString()}`);
  console.log('='.repeat(70));
  console.log('');
  for (const line of formatStatusReportText(report)) console.log(line);

  console.log('');
  console.log('Versão de configuração atual por usuário (Fase 10):');
  const users = await prisma.user.findMany({ select: { id: true, email: true, name: true } });
  if (!users.length) {
    console.log('  Nenhum usuário encontrado.');
  }
  for (const u of users) {
    const latest = await prisma.configVersion.findFirst({ where: { userId: u.id }, orderBy: { version: 'desc' } });
    const label = `${u.email ?? '(sem e-mail)'} ${u.name ? `(${u.name})` : ''}`.trim();
    if (!latest) {
      console.log(`  ${label} — sem histórico ainda (rode npm run config:version -- --baseline).`);
    } else {
      console.log(`  ${label} — v${latest.version}, via: ${latest.changedVia}, em ${latest.createdAt.toISOString()}`);
      console.log(`    Motivo: ${latest.reason}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[report-status] Falha:', e?.message ?? e);
    process.exit(1);
  });
