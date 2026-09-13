/**
 * Registra ConfigVersion 8 diretamente no banco (bypass do promoteConfigChange).
 *
 * Motivo: o promoteConfigChange só registra quando há mudança nos campos de
 * UserSettings. Neste caso, a mudança é no CÓDIGO (shadow evaluation ativado),
 * não na configuração — então precisamos inserir diretamente.
 *
 * Não é ideal, mas é a única forma de documentar que neste ponto o sistema
 * entrou em Fase C (Shadow Evaluation) sem mexer na configuração existente.
 *
 * Executar: npx tsx --require dotenv/config scripts/register-config-v8-direct.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('═'.repeat(70));
  console.log('Registro de ConfigVersion 8 — Fase C: Shadow Evaluation (inserção direta)');
  console.log('═'.repeat(70));
  console.log(`Data: ${new Date().toLocaleString('pt-BR')}`);
  console.log('─'.repeat(70));

  const USER_ID = 'cmtj8pi2a0000jo04xuxo8ukf'; // ueliton32@gmail.com

  // Pega o último versionNumber para calcular o próximo
  const last = await prisma.configVersion.findFirst({
    where: { userId: USER_ID },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const nextVersion = (last?.version ?? 0) + 1;
  console.log(`Próximo versionNumber: ${nextVersion} (último: ${last?.version ?? 0})`);

  // Busca o UserSettings atual para copiar os campos
  const settings = await prisma.userSettings.findUnique({
    where: { userId: USER_ID },
  });

  if (!settings) {
    console.error('❌ UserSettings não encontrado.');
    process.exit(1);
  }

  const version = await prisma.configVersion.create({
    data: {
      userId: USER_ID,
      version: nextVersion,
      monitoredPairs: settings.monitoredPairs,
      enabledStrategies: settings.enabledStrategies,
      pairStrategies: settings.pairStrategies ?? Prisma.JsonNull,
      pairStrategyTimeframes: settings.pairStrategyTimeframes ?? Prisma.JsonNull,
      reason: `Fase C — Shadow Evaluation ativada (09/09/2026). Regime filter ATIVO em código para estratégias 1 e 2 (qualquer TF) desde v4/v5, mas agora formalizado como fase de avaliação comparativa. Sinais SHADOW persistidos com source=shadow_v${nextVersion} para comparação contra PAPER_TRADING. Decisão após 2 semanas: manter filtro se shadow > paper, remover se shadow < paper. NOTA: este registro documenta mudança de código, não de configuração — os campos de UserSettings permanecem idênticos à v7.`,
      changedVia: 'register-config-v8-direct.ts',
    },
  });

  console.log(`✅ ConfigVersion ${version.version} criada com sucesso.`);
  console.log(`   userId: ${version.userId}`);
  console.log(`   enabledStrategies: ${JSON.stringify(version.enabledStrategies)}`);
  console.log(`   reason: ${version.reason.substring(0, 120)}...`);

  // Confirmação
  const allVersions = await prisma.configVersion.findMany({
    where: { userId: USER_ID },
    orderBy: { version: 'desc' },
    take: 3,
  });

  console.log('\n📋 Últimas versões:');
  for (const v of allVersions) {
    console.log(`  v${v.version} — ${new Date(v.createdAt).toLocaleDateString('pt-BR')} — ${v.reason.substring(0, 80)}...`);
  }
}

main().catch(console.error);