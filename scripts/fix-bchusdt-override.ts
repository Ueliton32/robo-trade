/**
 * Corrige o override de BCHUSDT em pairStrategies, que estava gravado como
 * `[]` (array vazio) — por causa do bug corrigido em
 * lib/pair-strategy-plan.ts e app/dashboard/configuracoes/page.tsx
 * (08/09/2026), isso fazia BCHUSDT cair de volta nos padrões globais
 * (incluindo Pullback na EMA20, id 2, já removida de todo o resto),
 * mesmo a intenção provável (mesmo padrão de todos os outros 18 pares)
 * ser "tudo ativo, exceto Pullback na EMA20".
 *
 * Com o bug de código já corrigido, `[]` passa a significar de verdade
 * "zero estratégias pra esse par" — o que provavelmente NÃO era a
 * intenção (deixaria BCHUSDT sem gerar sinal nenhum). Este script alinha
 * o dado com o padrão dos outros pares: todas as estratégias menos a 2.
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/fix-bchusdt-override.ts
 */
import { prisma } from '../lib/prisma';
import { ensureBaselineVersion, promoteConfigChange } from '../lib/config-promotion';

const PAIR = 'BCHUSDT';
const CORRECTED_STRATEGIES = [1, 3, 4, 5, 6]; // tudo menos Pullback na EMA20 (2)
const REASON =
  'Corrigido em 08/09/2026 — pairStrategies.BCHUSDT estava gravado como [] (override de zero estratégias) por causa de um bug na tela de Configurações/buildPairStrategyPlan que tratava array vazio igual a "sem override", fazendo BCHUSDT cair nos padrões globais (com Pullback na EMA20 incluído, já removida de todo o resto). Com o bug de código corrigido, alinhado ao padrão dos outros 18 pares: tudo ativo, exceto Pullback na EMA20.';

async function main() {
  const settings = await prisma.userSettings.findMany();

  for (const s of settings) {
    const current = (s.pairStrategies as Record<string, number[]> | null) ?? {};
    if (!(PAIR in current)) {
      console.log(`Usuário ${s.userId}: sem override pra ${PAIR} — nada a fazer.`);
      continue;
    }
    if (current[PAIR]?.length) {
      console.log(`Usuário ${s.userId}: ${PAIR} já tem override não-vazio (${JSON.stringify(current[PAIR])}) — não vou mexer.`);
      continue;
    }

    await ensureBaselineVersion(s.userId);
    const newPairStrategies = { ...current, [PAIR]: CORRECTED_STRATEGIES };
    const result = await promoteConfigChange({
      userId: s.userId,
      newSettings: { pairStrategies: newPairStrategies },
      reason: REASON,
      changedVia: 'fix-bchusdt-override-script',
    });
    console.log(`Usuário ${s.userId}: ${PAIR} corrigido pra ${JSON.stringify(CORRECTED_STRATEGIES)}. Nova versão: ${result.version} (mudou: ${result.changed}).`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Erro:', e);
  process.exit(1);
});
