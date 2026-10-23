/**
 * Reativa a Estratégia 1 (Rompimento de Range) SÓ nos pares e timeframe
 * validados pela auditoria de 23/10/2026, depois do gate de ATR
 * (lib/strategies.ts, ver comentário em detectRangeBreakout) ter sido
 * adicionado ao código de produção.
 *
 * Cadeia completa que levou a esta decisão:
 *   1. v17 (scripts/pause-strategy1-pending-review.ts): Estratégia 1
 *      pausada em TODOS os pares — decaimento confirmado (0% WR nos 9
 *      trades LONG fechados desde o bloqueio do SHORT em 03/10).
 *   2. Diagnóstico: nos trades LONG em regime LATERALIZACAO (o regime que
 *      o filtro já libera), 0% WR, atrRatio sempre perto de 1.0 — sinal
 *      de rompimento falso (fakeout), não problema de stop/alvo.
 *   3. scripts/experiment-range-breakout-atr-filter.ts: gate de ATR
 *      isolado, ganho real mas modesto (PF médio 0.84→0.89).
 *   4. scripts/experiment-range-breakout-regime-atr.ts: regime+ATR juntos
 *      em 15m (BTC/ETH/BNB) deu PF 1.22-1.27, n=21-33 — muito mais
 *      convincente que qualquer variante isolada. Em 1h, a combinação dos
 *      dois filtros zerou o sinal (n=0) em todos os 6 pares testados.
 *   5. scripts/experiment-range-breakout-regime-atr-15m-sweep.ts: varredura
 *      nos 14 pares restantes em 15m — só TRXUSDT (n=41, PF 1.39) e
 *      LINKUSDT (n=15, PF 1.62) teriam amostra e PF confiáveis o
 *      suficiente pra somar à lista. Os demais ficaram neutros, amostra
 *      pequena demais, ou com PF < 1 com amostra decente (AVAX, SUI, TAO,
 *      UNI — mantidos excluídos).
 *
 * Resultado: Estratégia 1 reativada SÓ em BTCUSDT, ETHUSDT, BNBUSDT,
 * TRXUSDT, LINKUSDT, SÓ no timeframe 15m (1h fica de fora — zero sinal
 * validado lá; 4h já estava permanentemente excluído desde a v17). SHORT
 * continua bloqueado globalmente (DIRECTION_BLOCKED_STRATEGIES_LIVE).
 *
 * Via promoteConfigChange() — versionado, auditável, reversível.
 *   npx tsx --require dotenv/config scripts/reactivate-strategy1-validated-pairs.ts
 */
import { prisma } from '../lib/prisma';
import { ensureBaselineVersion, promoteConfigChange } from '../lib/config-promotion';

const STRATEGY_ID = 1;
const VALIDATED_PAIRS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'TRXUSDT', 'LINKUSDT'];
const VALIDATED_TIMEFRAMES = ['15m'];

const REASON =
  'Estratégia 1 (Rompimento de Range) reativada em 23/10/2026, só em BTCUSDT/ETHUSDT/BNBUSDT/' +
  'TRXUSDT/LINKUSDT, só em 15m — depois de (1) pausa total na v17 por decaimento confirmado, ' +
  '(2) diagnóstico apontando rompimento falso (atrRatio~1.0 em LATERALIZACAO), (3) gate de ATR ' +
  '(atrRatio>1.3) adicionado ao código (lib/strategies.ts, mesmo limiar de lib/regime.ts), ' +
  '(4) backtest 6 meses combinando regime+ATR: 15m com PF 1.22-1.62 nestes 5 pares (n=15-41), ' +
  '1h zerou o sinal nos 6 pares testados (não incluído). Demais pares do portfólio ficaram ' +
  'neutros/amostra insuficiente (fora) ou negativos com amostra decente — AVAX/SUI/TAO/UNI ' +
  '(mantidos excluídos). SHORT continua bloqueado (DIRECTION_BLOCKED_STRATEGIES_LIVE), 4h ' +
  'continua excluído (nunca teve PF>1 em nenhuma amostra). Scripts de evidência: ' +
  'experiment-range-breakout-atr-filter.ts, experiment-range-breakout-regime-atr.ts, ' +
  'experiment-range-breakout-regime-atr-15m-sweep.ts.';

async function main() {
  const allSettings = await prisma.userSettings.findMany();
  console.log(`Encontradas ${allSettings.length} configuração(ões) de usuário.\n`);

  for (const settings of allSettings) {
    const monitored = settings.monitoredPairs ?? [];
    const defaultStrats = settings.enabledStrategies?.length ? settings.enabledStrategies : [1, 2, 3, 4, 5, 6];
    const pairStrategies = { ...((settings.pairStrategies as Record<string, number[]> | null) ?? {}) };
    const tfOverrides = { ...((settings.pairStrategyTimeframes as Record<string, Record<string, string[]>> | null) ?? {}) };

    const affected: string[] = [];
    for (const pair of VALIDATED_PAIRS) {
      if (!monitored.includes(pair)) {
        console.log(`Usuário ${settings.userId}: ${pair} não está em monitoredPairs — pulado.`);
        continue;
      }
      const current = Object.prototype.hasOwnProperty.call(pairStrategies, pair) ? pairStrategies[pair] : defaultStrats;
      if (!current.includes(STRATEGY_ID)) {
        pairStrategies[pair] = [...current, STRATEGY_ID];
      }
      tfOverrides[pair] = { ...(tfOverrides[pair] ?? {}), [String(STRATEGY_ID)]: VALIDATED_TIMEFRAMES };
      affected.push(pair);
    }

    if (!affected.length) {
      console.log(`Usuário ${settings.userId}: nenhum dos pares validados está monitorado — nada a fazer.`);
      continue;
    }

    await ensureBaselineVersion(settings.userId);
    const result = await promoteConfigChange({
      userId: settings.userId,
      newSettings: { pairStrategies, pairStrategyTimeframes: tfOverrides },
      reason: REASON,
      changedVia: 'reactivate-strategy1-validated-pairs-script',
    });

    console.log(`Usuário ${settings.userId}: nova versão ${result.version} (mudou: ${result.changed}). Pares reativados (15m): ${affected.join(', ')}`);
  }

  console.log('\nConcluído. Estratégia 1 volta a gerar sinal só nos 5 pares validados, só em 15m.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
