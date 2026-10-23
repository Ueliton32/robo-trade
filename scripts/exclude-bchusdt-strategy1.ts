/**
 * Exclui PERMANENTEMENTE BCHUSDT da Estratégia 1 (Rompimento de Range).
 *
 * Achado (23/10/2026, scripts/experiment-range-breakout-atr-filter.ts,
 * backtest 6 meses): BCHUSDT × 1h teve PF 0.28 (exp -2.21%/trade, n=42)
 * no baseline atual E PF 0.31 (exp -2.11%/trade, n=18) com o filtro de
 * ATR testado — pior combinação par/estratégia observada, por uma
 * margem grande, e o único par onde nenhuma variante testada chegou
 * perto de PF 1. Não é um problema de calibração do filtro, é o par em
 * si não funcionando para essa estratégia.
 *
 * NOTA IMPORTANTE: a Estratégia 1 já está pausada em TODOS os pares desde
 * a v17 (23/10/2026, scripts/pause-strategy1-pending-review.ts) — então
 * esta mudança não tem efeito algum no comportamento ao vivo HOJE (zero
 * timeframes já significa zero sinal em qualquer par, incluindo
 * BCHUSDT). O que este script faz é gravar uma exclusão EXPLÍCITA pra
 * BCHUSDT (em vez de depender só da ausência genérica causada pela
 * pausa total), pra que, quando a Estratégia 1 for reativada no futuro
 * (em outros pares), BCHUSDT não volte a ser incluído por engano — um
 * override explícito sem o id 1 continua valendo mesmo que a config
 * padrão volte a incluir a estratégia 1.
 *
 * Via promoteConfigChange() — versionado, auditável, reversível.
 *   npx tsx --require dotenv/config scripts/exclude-bchusdt-strategy1.ts
 */
import { prisma } from '../lib/prisma';
import { ensureBaselineVersion, promoteConfigChange } from '../lib/config-promotion';

const STRATEGY_ID = 1;
const PAIR = 'BCHUSDT';
const REASON =
  'BCHUSDT excluído PERMANENTEMENTE da Estratégia 1 (Rompimento de Range) em 23/10/2026 — ' +
  'backtest de 6 meses (scripts/experiment-range-breakout-atr-filter.ts): PF 0.28 (exp -2.21%/trade, ' +
  'n=42) no baseline e PF 0.31 (exp -2.11%/trade, n=18) com o filtro de ATR testado — pior combinação ' +
  'par/estratégia observada, nenhuma variante chegou perto de PF 1. Gravado como override explícito ' +
  '(não apenas ausência pela pausa geral da v17) pra sobreviver a uma futura reativação da Estratégia 1.';

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  console.log(`Encontradas ${allSettings.length} configuração(ões) de usuário.\n`);

  for (const settings of allSettings) {
    const pairs = settings.monitoredPairs ?? [];
    if (!pairs.includes(PAIR)) {
      console.log(`Usuário ${settings.userId}: ${PAIR} não está em monitoredPairs — nada a fazer.`);
      continue;
    }

    const defaultStrats = settings.enabledStrategies?.length ? settings.enabledStrategies : [1, 2, 3, 4, 5, 6];
    const pairStrategies = { ...((settings.pairStrategies as Record<string, number[]> | null) ?? {}) };

    const current = Object.prototype.hasOwnProperty.call(pairStrategies, PAIR) ? pairStrategies[PAIR] : defaultStrats;
    if (!current.includes(STRATEGY_ID)) {
      // Já não inclui (provavelmente por causa da pausa geral da v17) — ainda
      // assim grava o override explícito, pra não depender da pausa geral.
      pairStrategies[PAIR] = current.filter((id) => id !== STRATEGY_ID);
    } else {
      pairStrategies[PAIR] = current.filter((id) => id !== STRATEGY_ID);
    }

    await ensureBaselineVersion(settings.userId);
    const result = await promoteConfigChange({
      userId: settings.userId,
      newSettings: { pairStrategies },
      reason: REASON,
      changedVia: 'exclude-bchusdt-strategy1-script',
    });

    console.log(`Usuário ${settings.userId}: nova versão ${result.version} (mudou: ${result.changed}). ${PAIR} agora: ${JSON.stringify(pairStrategies[PAIR])}`);
  }

  console.log('\nConcluído.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
