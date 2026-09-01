/**
 * Script de migração ÚNICA (rode uma vez, depois pode apagar este arquivo).
 *
 * A versão antiga do seed.ts inseria 3 sinais de exemplo com resultado
 * FICTÍCIO ("WIN" com PnL inventado) e nenhuma marca distinguindo-os de
 * sinais reais. Se você já rodou o seed antigo em produção, esses 3
 * registros estão hoje contaminando qualquer cálculo de estatística real.
 *
 * Este script NÃO apaga nada — ele identifica esses registros específicos
 * (pelo par + preço de entrada + trecho do texto do motivo, que são únicos
 * do seed antigo) e os marca como source:'demo' / status:'DEMO', para que
 * fiquem de fora do cálculo de lib/stats-engine.ts, mas continuem visíveis
 * no histórico caso você queira auditar.
 *
 * Como rodar:
 *   cd nextjs_space
 *   npx tsx --require dotenv/config scripts/migrate-legacy-demo-signals.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fingerprint exato dos 3 registros inseridos pelo seed.ts antigo.
const LEGACY_FAKE_SIGNALS = [
  { pair: 'BTCUSDT', entryPrice: 67500.0, strategyId: 1 },
  { pair: 'ETHUSDT', entryPrice: 3450.0, strategyId: 4 },
  { pair: 'SOLUSDT', entryPrice: 145.2, strategyId: 3 },
];

async function main() {
  let updated = 0;

  for (const fp of LEGACY_FAKE_SIGNALS) {
    const matches = await prisma.signal.findMany({
      where: {
        pair: fp.pair,
        entryPrice: fp.entryPrice,
        strategyId: fp.strategyId,
        source: 'live', // só mexe se ainda não foi migrado
      },
    });

    for (const m of matches) {
      await prisma.signal.update({
        where: { id: m.id },
        data: { source: 'demo', status: 'DEMO' },
      });
      updated++;
      console.log(`Marcado como demo: ${m.pair} / estratégia ${m.strategyId} / id ${m.id}`);
    }
  }

  console.log(`\nConcluído. ${updated} sinal(is) legado(s) marcado(s) como demo.`);
  console.log('Rode POST /api/strategies/recalculate (ou clique em "Recalcular com dados reais" na tela de Estatísticas) para atualizar os números.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
