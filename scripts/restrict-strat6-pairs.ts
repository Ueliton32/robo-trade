/**
 * Restringe a Compressão de Volatilidade (id 6) só a XLMUSDT e ZECUSDT —
 * os únicos 2 pares com evidência real de funcionar, entre os 7 que a
 * rodavam ao vivo.
 *
 * Achado (16/09/2026, scripts/radar-scan-strat6.ts): filtro de regime
 * (LATERALIZACAO) não é viável pra essa estratégia — raramente qualifica
 * (0-15% dos sinais passariam), amostra filtrada insuficiente em quase
 * toda combinação (14 de 21 "sem dados suficientes", 0 melhorou/piorou).
 * Mas o desempenho SEM filtro em 1h (única faixa com amostra decente,
 * n=16-35 por par) mostrou padrão claro:
 *   XLMUSDT  n=17  WR=47%  PF=1.41  — boa
 *   ZECUSDT  n=20  WR=45%  PF=1.23  — boa
 *   BNBUSDT  n=35  WR=37%  PF=0.67  — ruim
 *   BCHUSDT  n=32  WR=31%  PF=0.46  — ruim
 *   UNIUSDT  n=26  WR=23%  PF=0.52  — ruim
 *   XRPUSDT  n=23  WR=30%  PF=0.35  — ruim
 *   TAOUSDT  n=16  WR=19%  PF=0.37  — ruim
 * Bate com o que a crise de 14/09 já mostrou (Compressão de Volatilidade
 * LONG catastrófica na semana). 5 de 7 pares claramente ruins.
 *
 * O que este script faz: pra cada par que tem "6" em pairStrategies,
 * remove só o 6 (mantém as outras estratégias do par intactas), exceto
 * XLMUSDT e ZECUSDT. Via promoteConfigChange() — versionado, auditável,
 * reversível.
 *
 * Rode uma vez:
 *   npx tsx --require dotenv/config scripts/restrict-strat6-pairs.ts
 */
import { prisma } from '../lib/prisma';
import { ensureBaselineVersion, promoteConfigChange } from '../lib/config-promotion';

const STRATEGY_ID = 6;
const KEEP_PAIRS = new Set(['XLMUSDT', 'ZECUSDT']);
const REASON =
  'Restringido em 16/09/2026 — RadarContextScan (scripts/radar-scan-strat6.ts) mostrou 5 de 7 pares claramente ruins pra Compressão de Volatilidade em 1h (BNBUSDT PF=0.67, XRPUSDT PF=0.35, TAOUSDT PF=0.37, BCHUSDT PF=0.46, UNIUSDT PF=0.52), enquanto XLMUSDT (PF=1.41) e ZECUSDT (PF=1.23) têm evidência real de funcionar. Filtro de regime testado e descartado por falta de amostra (14 de 21 combinações sem dado suficiente, 0 melhorou/piorou). Bate com a crise de 14/09, onde essa estratégia foi uma das principais responsáveis pelo drawdown.';

async function main() {
  const allSettings = await prisma.userSettings.findMany();

  for (const settings of allSettings) {
    const current = (settings.pairStrategies as Record<string, number[]> | null) ?? {};
    const affectedPairs: string[] = [];
    const newPairStrategies = { ...current };

    for (const [pair, ids] of Object.entries(current)) {
      if (KEEP_PAIRS.has(pair)) continue;
      if (!ids.includes(STRATEGY_ID)) continue;
      newPairStrategies[pair] = ids.filter((id) => id !== STRATEGY_ID);
      affectedPairs.push(pair);
    }

    if (!affectedPairs.length) {
      console.log(`Usuário ${settings.userId}: nada a fazer (estratégia 6 já só em XLM/ZEC ou ausente).`);
      continue;
    }

    await ensureBaselineVersion(settings.userId);
    const result = await promoteConfigChange({
      userId: settings.userId,
      newSettings: { pairStrategies: newPairStrategies },
      reason: REASON,
      changedVia: 'restrict-strat6-pairs-script',
    });

    console.log(`Usuário ${settings.userId}: estratégia 6 removida de ${affectedPairs.join(', ')}. Nova versão: ${result.version} (mudou: ${result.changed}).`);
    for (const p of affectedPairs) console.log(`  ${p}: ${JSON.stringify(newPairStrategies[p])}`);
  }

  console.log('\nConcluído. Sinais PENDENTE já abertos nesses pares/estratégia continuam sendo monitorados e fechados normalmente.');
}

main()
  .catch((e) => { console.error('Erro:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
