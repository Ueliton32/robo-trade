/**
 * Restringe a Compressão de Volatilidade (id 6) ainda mais: tira o ZECUSDT
 * e o timeframe 1d, deixando só XLMUSDT em 1h e 4h.
 *
 * Achado (03/10/2026, scripts/audit-strategy-direction.ts, 6 meses, só os
 * pares operados ao vivo): ZEC PF=0.68 (soma -32.8%, n=41) e, ao vivo,
 * PF=0.81 — a decisão de 16/09 (ZEC 1h PF 1.23, 3 meses) não se sustentou
 * com amostra maior (6 meses: ZEC 1h PF 0.81). XLM PF=1.28 (+19.3%, n=44),
 * forte no 4h (PF 1.89, n=12), ~neutro no 1h (PF 0.94). O 1d perde: ao
 * vivo n=10, WR 10%, -24.2%; no backtest o único trade foi -22.4%.
 *
 * Via promoteConfigChange() — versionado, auditável, reversível.
 *   npx tsx --require dotenv/config scripts/restrict-strat6-xlm-4h1h.ts
 */
import { prisma } from '../lib/prisma';
import { ensureBaselineVersion, promoteConfigChange } from '../lib/config-promotion';

const STRATEGY_ID = 6;
const REASON =
  'Compressão de Volatilidade (id 6) restringida em 03/10/2026 — auditoria 6 meses (scripts/audit-strategy-direction.ts): ZEC removido (PF 0.68, soma -32.8%, n=41; ao vivo PF 0.81; o PF 1.23 de 16/09 era amostra curta de 3 meses), 1d removido (ao vivo n=10, WR 10%, -24.2%). Mantido XLMUSDT em 1h/4h (PF 1.28 no total, 4h PF 1.89 n=12, 1h PF 0.94).';

async function main() {
  const allSettings = await prisma.userSettings.findMany();

  for (const settings of allSettings) {
    const pairStrategies = { ...((settings.pairStrategies as Record<string, number[]> | null) ?? {}) };
    const tfOverrides = { ...((settings.pairStrategyTimeframes as Record<string, Record<string, string[]>> | null) ?? {}) };

    if (pairStrategies.ZECUSDT?.includes(STRATEGY_ID)) {
      pairStrategies.ZECUSDT = pairStrategies.ZECUSDT.filter((id) => id !== STRATEGY_ID);
    }
    tfOverrides.XLMUSDT = { ...(tfOverrides.XLMUSDT ?? {}), [String(STRATEGY_ID)]: ['1h', '4h'] };

    await ensureBaselineVersion(settings.userId);
    const result = await promoteConfigChange({
      userId: settings.userId,
      newSettings: { pairStrategies, pairStrategyTimeframes: tfOverrides },
      reason: REASON,
      changedVia: 'restrict-strat6-xlm-4h1h-script',
    });
    console.log(`Usuário ${settings.userId}: nova versão ${result.version} (mudou: ${result.changed}).`);
    console.log(`  ZECUSDT: ${JSON.stringify(pairStrategies.ZECUSDT)} | XLMUSDT: ${JSON.stringify(pairStrategies.XLMUSDT)} | tf XLM: ${JSON.stringify(tfOverrides.XLMUSDT)}`);
  }

  console.log('\nConcluído. Sinais PENDENTE já abertos continuam sendo monitorados e fechados normalmente.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
