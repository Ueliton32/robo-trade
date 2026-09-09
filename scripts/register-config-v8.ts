/**
 * ConfigVersion 8 — Fase C: Shadow Evaluation ativada (09/09/2026)
 *
 * Alterações:
 *   - enabledStrategies: [1, 2, 3, 4, 5, 6] (inalterado — mantém todas)
 *   - pairStrategies: sem mudança
 *   - Motivação: ativar regime filter para estratégias 1 e 2 (já estava no
 *     código, mas agora formalizada como versão para auditabilidade).
 *   - Regra de decisão: se após 2 semanas shadow > paper, manter filtro.
 *     Se shadow < paper, remover filtro (rollback para v7).
 *
 * Executar: npx tsx --require dotenv/config scripts/register-config-v8.ts
 */

import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { promoteConfigChange } from '@/lib/config-promotion';

async function main() {
  console.log('═'.repeat(70));
  console.log('Registro de ConfigVersion 8 — Fase C: Shadow Evaluation');
  console.log('═'.repeat(70));
  console.log(`Data: ${new Date().toLocaleString('pt-BR')}`);
  console.log('─'.repeat(70));

  const USER_ID = 'cmtj8pi2a0000jo04xuxo8ukf'; // ueliton32@gmail.com
  const userId = USER_ID;

  // O estado atual já está com regime filter ativo (código alterado em
  // analysis-engine.ts). Só precisamos registrar a versão para auditabilidade.
  // enabledStrategies e demais campos não mudaram em relação à v7.

  const result = await promoteConfigChange({
    userId,
    newSettings: {
      // Sem mudança nos campos — só registramos a versão para documentar
      // que neste ponto o regime filter foi ativado pelo código.
      // enabledStrategies já está [1,2,3,4,5,6] (inalterado desde v5)
    },
    reason: `Fase C — Shadow Evaluation ativada (09/09/2026). Regime filter aplicado a estratégias 1 e 2 (qualquer TF). Sinais SHADOW persistidos com source=shadow_v8 para comparação contra PAPER_TRADING. Decisão após 2 semanas: manter filtro se shadow > paper, remover se shadow < paper.`,
    changedVia: 'register-config-v8.ts',
  });

  if (result.changed) {
    console.log(`✅ ConfigVersion ${result.version} registrada com sucesso.`);
  } else {
    console.log(`ℹ Nenhuma mudança detectada — versão não registrada (estado já atual).`);
    console.log(`   Verifique se a versão anterior (v7) já registrou esta configuração.`);
  }

  // Mostra o histórico
  const versions = await prisma.configVersion.findMany({
    where: { userId },
    orderBy: { version: 'desc' },
    take: 10,
  });

  console.log('\n📋 Histórico de ConfigVersions:');
  console.log('─'.repeat(70));
  for (const v of versions) {
    const enabledRaw = v.enabledStrategies as unknown as string | number[];
    const enabled = typeof enabledRaw === 'string' ? JSON.parse(enabledRaw) : enabledRaw;
    console.log(`v${v.version} (${new Date(v.createdAt).toLocaleDateString('pt-BR')}) — strategies: [${enabled.join(', ')}] — ${v.reason.substring(0, 80)}...`);
  }
  console.log('─'.repeat(70));
}

main().catch(console.error);