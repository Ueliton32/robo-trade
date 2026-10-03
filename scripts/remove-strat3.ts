/**
 * Tira a Trap de Liquidez (id 3) de operação em todos os pares.
 *
 * Achado (03/10/2026, scripts/backtest-strat3-regime-direction.ts): em 6
 * meses de histórico, 1h, nos 6 pares que rodavam a #3 ao vivo (BNB, XRP,
 * LTC, TRX, XLM, BCH), 985 trades: PF=0.77, soma=-202.8%. NENHUM par
 * ficou com PF>=1 (de 0.54 a 0.93), então podar por par (como na #6)
 * não acha subconjunto bom. O corte LONG em ALTA_CORRECAO, testado como
 * alternativa, só melhorou de verdade XRP/XLM (PF agregado 0.77→0.79) —
 * descartado. A #3 também respondeu por 15 dos 16 sinais fechados em
 * 28/09 (-23.8% líquido, daily_loss disparado).
 *
 * Remove o 3 de pairStrategies de cada par e de enabledStrategies (pra
 * par novo, sem override, também não herdar a #3). Via promoteConfigChange()
 * — versionado, auditável, reversível. Sinais PENDENTE já abertos continuam
 * sendo monitorados e fechados normalmente. pairStrategyTimeframes é
 * deixado como está (inofensivo sem o 3 em pairStrategies; facilita religar).
 *
 *   npx tsx --require dotenv/config scripts/remove-strat3.ts
 */
import { prisma } from '../lib/prisma';
import { ensureBaselineVersion, promoteConfigChange } from '../lib/config-promotion';

const STRATEGY_ID = 3;
const REASON =
  'Trap de Liquidez (id 3) removida em 03/10/2026 — backtest 6 meses/1h nos 6 pares que a rodavam (scripts/backtest-strat3-regime-direction.ts): 985 trades, PF=0.77, soma=-202.8%, nenhum par com PF>=1 (0.54 a 0.93), sem subconjunto de pares viável. Filtro alternativo (bloquear LONG em ALTA_CORRECAO) melhorou só XRP/XLM e o PF agregado de 0.77 para 0.79 — descartado. A #3 respondeu por 15 de 16 sinais fechados em 28/09 (-23.8% líquido, daily_loss disparado).';

async function main() {
  const allSettings = await prisma.userSettings.findMany();

  for (const settings of allSettings) {
    const current = (settings.pairStrategies as Record<string, number[]> | null) ?? {};
    const newPairStrategies: Record<string, number[]> = { ...current };
    const affectedPairs: string[] = [];
    for (const [pair, ids] of Object.entries(current)) {
      if (!ids.includes(STRATEGY_ID)) continue;
      newPairStrategies[pair] = ids.filter((id) => id !== STRATEGY_ID);
      affectedPairs.push(pair);
    }

    const enabled = settings.enabledStrategies ?? [];
    const newEnabled = enabled.filter((id) => id !== STRATEGY_ID);
    const enabledChanged = enabled.length !== newEnabled.length;
    // enabledStrategies vazio faz o plano cair em "todas as estratégias" — nunca gravar [].
    if (enabledChanged && !newEnabled.length) {
      console.log(`Usuário ${settings.userId}: enabledStrategies ficaria vazio, mantendo como está.`);
    }

    if (!affectedPairs.length && !(enabledChanged && newEnabled.length)) {
      console.log(`Usuário ${settings.userId}: nada a fazer (estratégia 3 já ausente).`);
      continue;
    }

    await ensureBaselineVersion(settings.userId);
    const result = await promoteConfigChange({
      userId: settings.userId,
      newSettings: {
        pairStrategies: newPairStrategies,
        ...(enabledChanged && newEnabled.length ? { enabledStrategies: newEnabled } : {}),
      },
      reason: REASON,
      changedVia: 'remove-strat3-script',
    });

    console.log(`Usuário ${settings.userId}: estratégia 3 removida de ${affectedPairs.join(', ') || '(nenhum override)'}; enabledStrategies ${enabledChanged ? 'ajustado' : 'sem mudança'}. Nova versão: ${result.version} (mudou: ${result.changed}).`);
  }

  console.log('\nConcluído. Sinais PENDENTE já abertos da #3 continuam sendo monitorados e fechados normalmente.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
