/**
 * Tira a Compressão de Volatilidade (id 6) de operação (hoje só XLMUSDT 1h/4h).
 *
 * Motivo (06/10/2026): o robô está parado pelo breaker loss_streak (11 perdas
 * seguidas; limite 10) e 5 delas são da #6 em XLM (24/09 a 05/10). Ao vivo a
 * #6 em XLM tem PF 0.70 em 14 sinais (-6.8%); o backtest de 6 meses (PF 1.28,
 * n=44) não se confirmou na prática, e a mesma estratégia já tinha virado de
 * PF 1.23 para 0.68 em ZEC ao aumentar a amostra. Sem evidência sólida, sai.
 *
 * Remove o 6 de pairStrategies de cada par e de enabledStrategies. Via
 * promoteConfigChange() — versionado, auditável, reversível. A detecção
 * continua no código (lib/strategies.ts), só sem habilitação.
 *
 *   npx tsx --require dotenv/config scripts/remove-strat6.ts
 */
import { prisma } from '../lib/prisma';
import { ensureBaselineVersion, promoteConfigChange } from '../lib/config-promotion';

const STRATEGY_ID = 6;
const REASON =
  'Compressão de Volatilidade (id 6) removida em 06/10/2026: robô parado pelo breaker loss_streak (11 perdas seguidas, 5 da #6 em XLM entre 24/09 e 05/10); ao vivo XLM PF 0.70 em 14 sinais (-6.8%) contra PF 1.28 no backtest de 6 meses; mesma estratégia já havia virado de PF 1.23 para 0.68 em ZEC com amostra maior. Fica só a #1 (LONG 1h/4h).';

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  for (const settings of allSettings) {
    const current = (settings.pairStrategies as Record<string, number[]> | null) ?? {};
    const next: Record<string, number[]> = { ...current };
    const touched: string[] = [];
    for (const [pair, ids] of Object.entries(current)) {
      if (!ids.includes(STRATEGY_ID)) continue;
      next[pair] = ids.filter((id) => id !== STRATEGY_ID);
      touched.push(pair);
    }
    const enabled = settings.enabledStrategies ?? [];
    const newEnabled = enabled.filter((id) => id !== STRATEGY_ID);
    const enabledChanged = newEnabled.length !== enabled.length;
    // enabledStrategies vazio faz o plano cair em "todas as estratégias" — nunca gravar [].
    if (enabledChanged && !newEnabled.length) throw new Error('enabledStrategies ficaria vazio — abortando');

    console.log(`Usuário ${settings.userId}: enabledStrategies ${JSON.stringify(enabled)} → ${JSON.stringify(newEnabled)}`);
    if (!touched.length && !enabledChanged) { console.log('  nada a fazer.'); continue; }

    await ensureBaselineVersion(settings.userId);
    const result = await promoteConfigChange({
      userId: settings.userId,
      newSettings: { pairStrategies: next, ...(enabledChanged ? { enabledStrategies: newEnabled } : {}) },
      reason: REASON,
      changedVia: 'remove-strat6-script',
    });
    console.log(`  removida de: ${touched.join(', ') || '(nenhum override)'} | nova versão ${result.version} (mudou: ${result.changed}).`);
  }
}

main().catch((e) => { console.error('Erro:', e); process.exit(1); }).finally(() => prisma.$disconnect());
