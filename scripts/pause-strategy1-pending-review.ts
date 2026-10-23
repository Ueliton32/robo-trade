/**
 * Pausa a Estratégia 1 (Rompimento de Range) em todos os pares — duas
 * causas diferentes, registradas juntas porque a ação imediata é a mesma
 * (zero timeframes ativos), mas o motivo de cada uma é distinto:
 *
 * 1. Timeframe 4h: remoção PERMANENTE. Nunca teve PF > 1 em nenhuma
 *    amostra — backtest de 6 meses (PF 0.26, só SHORT, já bloqueado em
 *    03/10) e, isolando só LONG (o que roda hoje), 2 trades fechados,
 *    ambos LOSS, -3.97%/trade. Decisão de baixo risco e alta confiança.
 *
 * 2. Timeframes 1h e 15m: pausa TEMPORÁRIA, pendente de mais dado.
 *    LONG all-time tinha edge real (+1.07%/trade, n=55, WR 52.7%), mas
 *    decaiu: últimas ~7 semanas (desde que o custo líquido passa a ser
 *    calculado) já negativo mesmo bruto (-0.17%/trade, n=39), e nos 9
 *    trades fechados desde o bloqueio do SHORT (03/10) — 0% de vitória,
 *    -2.49%/trade. Amostra pequena demais pra confirmar mudança de
 *    regime vs. regressão à média, mas grande o suficiente pra não
 *    continuar operando capital-sinal enquanto isso. Revisitar depois de
 *    acumular ~20-30 trades fechados numa configuração só-LONG.
 *
 * Com isso, a Estratégia 1 fica com zero timeframes ativos em todo par —
 * na prática, sem gerar sinal novo nenhum, até decisão em contrário.
 *
 * Via promoteConfigChange() — versionado, auditável, reversível.
 *   npx tsx --require dotenv/config scripts/pause-strategy1-pending-review.ts
 */
import { prisma } from '../lib/prisma';
import { ensureBaselineVersion, promoteConfigChange } from '../lib/config-promotion';

const STRATEGY_ID = 1;
const REASON =
  'Estratégia 1 (Rompimento de Range) pausada em todos os pares em 23/10/2026 — ' +
  '4h removido PERMANENTEMENTE (nunca teve PF>1 em nenhuma amostra; isolando só LONG, ' +
  '2/2 trades fechados foram LOSS, -3.97%/trade). 1h e 15m pausados TEMPORARIAMENTE: ' +
  'LONG all-time tinha edge (+1.07%/trade, n=55), mas decaiu — últimas ~7 semanas já ' +
  'negativo bruto (-0.17%/trade, n=39) e, nos 9 trades fechados desde o bloqueio do SHORT ' +
  'em 03/10, 0% de vitória (-2.49%/trade). Revisitar após acumular ~20-30 trades fechados ' +
  'só-LONG em 1h/15m antes de reativar.';

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  console.log(`Encontradas ${allSettings.length} configuração(ões) de usuário.\n`);

  for (const settings of allSettings) {
    const pairs = settings.monitoredPairs ?? [];
    const defaultStrats = settings.enabledStrategies?.length ? settings.enabledStrategies : [1, 2, 3, 4, 5, 6];
    const pairStrategies = { ...((settings.pairStrategies as Record<string, number[]> | null) ?? {}) };

    const affectedPairs: string[] = [];
    for (const pair of pairs) {
      const current = Object.prototype.hasOwnProperty.call(pairStrategies, pair) ? pairStrategies[pair] : defaultStrats;
      if (!current.includes(STRATEGY_ID)) continue;
      pairStrategies[pair] = current.filter((id) => id !== STRATEGY_ID);
      affectedPairs.push(pair);
    }

    if (!affectedPairs.length) {
      console.log(`Usuário ${settings.userId}: Estratégia 1 já não estava ativa em nenhum par monitorado — nada a fazer.`);
      continue;
    }

    await ensureBaselineVersion(settings.userId);
    const result = await promoteConfigChange({
      userId: settings.userId,
      newSettings: { pairStrategies },
      reason: REASON,
      changedVia: 'pause-strategy1-pending-review-script',
    });

    console.log(`Usuário ${settings.userId}: nova versão ${result.version} (mudou: ${result.changed}). Pares afetados: ${affectedPairs.join(', ')}`);
  }

  console.log('\nConcluído. Sinais PENDENTE já abertos continuam sendo monitorados e fechados normalmente — isso só afeta geração de sinal NOVO.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
