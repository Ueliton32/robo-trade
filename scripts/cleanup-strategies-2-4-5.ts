/**
 * Limpeza das estratégias sem evidência (auditoria de 06/10/2026): tira a #2
 * (Pullback na EMA20), a #4 (Funding Extremo) e a #5 (Reversão após
 * Liquidação) de operação, em todos os pares e do padrão de par novo
 * (enabledStrategies). Ficam só a #1 (LONG 1h/4h) e a #6 (XLM 1h/4h).
 *
 *  - #2: já pausada desde 05/09 (expectância líquida -0.263%); falta tirar do
 *    padrão pra par novo não herdar.
 *  - #4: eventos de funding extremo caíram ~90% desde 2016 (BitMEX); 0 sinais
 *    ao vivo em 30 dias; sem evidência própria.
 *  - #5: só 3 sinais ao vivo (PF 0.10); detecção em 5m com ciclo de 15 min
 *    (descompasso com o backtest, que avalia cada candle de 5m); em estresse
 *    (10/10/2025) a liquidez do book sumiu, o que invalida a premissa de fill.
 *
 * Via promoteConfigChange() — versionado, auditável, reversível. Sinais
 * PENDENTE já abertos continuam sendo monitorados e fechados normalmente. A
 * detecção continua no código (lib/strategies.ts), só sem habilitação.
 *
 *   npx tsx --require dotenv/config scripts/cleanup-strategies-2-4-5.ts
 */
import { prisma } from '../lib/prisma';
import { ensureBaselineVersion, promoteConfigChange } from '../lib/config-promotion';

const REMOVE = new Set([2, 4, 5]);
const REASON =
  'Limpeza de estratégias em 06/10/2026 (auditoria de estratégias): removidas #2 Pullback na EMA20 (pausada desde 05/09, expectância líquida -0.263%), #4 Funding Extremo (eventos extremos -90% desde 2016, 0 sinais ao vivo em 30d) e #5 Reversão após Liquidação (3 sinais ao vivo, PF 0.10; detecção 5m com ciclo de 15min; liquidez do book some em estresse). Ficam #1 (LONG 1h/4h) e #6 (XLM 1h/4h).';

async function main() {
  const allSettings = await prisma.userSettings.findMany();

  for (const settings of allSettings) {
    const current = (settings.pairStrategies as Record<string, number[]> | null) ?? {};
    const next: Record<string, number[]> = { ...current };
    const touched: string[] = [];
    for (const [pair, ids] of Object.entries(current)) {
      const kept = ids.filter((id) => !REMOVE.has(id));
      if (kept.length !== ids.length) { next[pair] = kept; touched.push(`${pair} (${ids.filter((id) => REMOVE.has(id)).map((i) => '#' + i).join(',')})`); }
    }

    const enabled = settings.enabledStrategies ?? [];
    const newEnabled = enabled.filter((id) => !REMOVE.has(id));
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
      changedVia: 'cleanup-strategies-2-4-5-script',
    });
    console.log(`  removidas de: ${touched.join(', ') || '(nenhum override)'}`);
    console.log(`  nova versão ${result.version} (mudou: ${result.changed}).`);
  }
  console.log('\nConcluído. Sinais PENDENTE já abertos continuam sendo monitorados e fechados normalmente.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
