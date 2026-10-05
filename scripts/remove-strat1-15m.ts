/**
 * Tira o timeframe 15m do Rompimento de Range (id 1) em todos os pares.
 *
 * Achado (05/10/2026, scripts/audit-strategy-direction.ts + teste de
 * estresse de custo): no backtest de 6 meses, 15 pares, como roda ao vivo
 * (com gate de regime), o 15m tem 643 trades com PF=0.82 (soma -126.6%) e
 * o LONG sozinho (n=313) PF=0.77 (-81.2%) — negativo mesmo sem custo extra
 * e o que mais piora com slippage (+0.20%/op: PF 0.63). Ao vivo o 15m LONG
 * foi bem (PF 2.91) mas com só n=13. O 1h e o 4h ficam.
 *
 * Mexe só em pairStrategyTimeframes (par → estratégia → timeframes), via
 * promoteConfigChange() — versionado, auditável, reversível. Pares com
 * override existente têm o 15m removido da lista dele; pares sem override
 * ganham override com os timeframes padrão da estratégia menos o 15m.
 *
 *   npx tsx --require dotenv/config scripts/remove-strat1-15m.ts
 */
import { prisma } from '../lib/prisma';
import { STRATEGY_DEFS } from '../lib/strategies';
import { buildPairStrategyPlan } from '../lib/pair-strategy-plan';
import { ensureBaselineVersion, promoteConfigChange } from '../lib/config-promotion';

const STRATEGY_ID = 1;
const REMOVE_TF = '15m';
const REASON =
  'Rompimento de Range (id 1): timeframe 15m removido em 05/10/2026 — backtest 6 meses/15 pares (scripts/audit-strategy-direction.ts): 15m efetivo n=643 PF 0.82 (-126.6%), LONG n=313 PF 0.77 (-81.2%), pior com custo extra (+0.20%/op: PF 0.63). Ao vivo o 15m LONG teve PF 2.91 mas com só n=13. 1h e 4h mantidos.';

async function main() {
  const strat = STRATEGY_DEFS.find((s) => s.id === STRATEGY_ID)!;
  const allSettings = await prisma.userSettings.findMany();

  for (const settings of allSettings) {
    const plan = buildPairStrategyPlan(settings as any);
    const tfOverrides = JSON.parse(JSON.stringify((settings.pairStrategyTimeframes as Record<string, Record<string, string[]>> | null) ?? {}));
    const changedPairs: string[] = [];

    for (const [pair, byStrategy] of Object.entries(plan)) {
      const current = byStrategy[STRATEGY_ID];
      if (!current || !current.includes(REMOVE_TF)) continue;
      const next = current.filter((tf) => tf !== REMOVE_TF);
      if (!next.length) throw new Error(`${pair}: removeria todos os timeframes da estratégia ${STRATEGY_ID}`);
      tfOverrides[pair] = { ...(tfOverrides[pair] ?? {}), [String(STRATEGY_ID)]: next };
      changedPairs.push(pair);
    }

    if (!changedPairs.length) { console.log(`Usuário ${settings.userId}: nada a fazer (sem 15m na #1).`); continue; }

    await ensureBaselineVersion(settings.userId);
    const result = await promoteConfigChange({
      userId: settings.userId,
      newSettings: { pairStrategyTimeframes: tfOverrides },
      reason: REASON,
      changedVia: 'remove-strat1-15m-script',
    });
    console.log(`Usuário ${settings.userId}: 15m removido da #1 em ${changedPairs.length} pares (${changedPairs.join(', ')}). Nova versão: ${result.version} (mudou: ${result.changed}).`);
    console.log(`  Timeframes padrão da #1: ${strat.timeframes.join(', ')}`);
  }
  console.log('\nConcluído. Sinais PENDENTE de 15m já abertos continuam sendo monitorados e fechados normalmente.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
