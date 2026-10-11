/**
 * Fecha a mercado, manualmente, os sinais live ainda PENDENTES — ao preço
 * atual da Binance, gravando o resultado de verdade (PnL bruto e líquido
 * pelos mesmos custos de lib/trading-costs.ts) com exitReason='MANUAL'.
 * Entra nas estatísticas como qualquer outro fechamento (nada fica escondido):
 * status WIN/LOSS conforme o sinal do PnL líquido.
 *
 * Origem (06/10/2026): robô parado pelo breaker loss_streak, dois sinais de 1h
 * abertos há 2 dias no prejuízo; decisão do usuário de encerrá-los em vez de
 * esperar o stop/alvo.
 *
 * Sem --apply só mostra o que faria (dry-run). Só atualiza linhas que ainda
 * estão PENDENTE no momento da gravação (se o ciclo fechar uma antes, pula).
 *
 *   npx tsx --require dotenv/config scripts/close-open-signals-manual.ts [--apply]
 */
import { prisma } from '../lib/prisma';
import { computeNetPnl } from '../lib/trading-costs';

const apply = process.argv.includes('--apply');

async function lastPrice(pair: string): Promise<number> {
  const res = await fetch(`https://fapi.binance.com/fapi/v1/ticker/price?symbol=${pair}`);
  if (!res.ok) throw new Error(`Binance ${pair}: HTTP ${res.status}`);
  const price = parseFloat((await res.json()).price);
  if (!(price > 0)) throw new Error(`Binance ${pair}: preço inválido`);
  return price;
}

async function main() {
  const open = await prisma.signal.findMany({ where: { source: 'live', status: 'PENDENTE' } });
  console.log(`${apply ? 'APLICANDO' : 'DRY-RUN'} — ${open.length} sinal(is) PENDENTE(s)\n`);

  for (const s of open) {
    const price = await lastPrice(s.pair);
    const now = new Date();
    const gross = (s.direction === 'LONG' ? (price - s.entryPrice) / s.entryPrice : (s.entryPrice - price) / s.entryPrice) * 100;
    const costs = computeNetPnl({ pnlGrossPercent: gross, direction: s.direction, fundingRateAtSignal: s.fundingRateAtSignal, entryTime: s.createdAt, exitTime: now });
    const status = costs.pnlNetPercent > 0 ? 'WIN' : 'LOSS';
    console.log(`${s.pair} ${s.direction} ${s.timeframe} (#${s.strategyId}): entrada ${s.entryPrice} → saída ${price} | bruto ${gross.toFixed(2)}% líquido ${costs.pnlNetPercent.toFixed(2)}% (taxa ${costs.feesPercent}%, funding ${costs.fundingCostPercent.toFixed(3)}%) → ${status}`);

    if (!apply) continue;
    const r = await prisma.signal.updateMany({
      where: { id: s.id, status: 'PENDENTE' },
      data: {
        status, result: status, pnlPercent: gross, closedAt: now, exitPrice: price, exitReason: 'MANUAL',
        feesPercent: costs.feesPercent, slippagePercent: costs.slippagePercent, fundingCostPercent: costs.fundingCostPercent, pnlNetPercent: costs.pnlNetPercent,
      },
    });
    console.log(r.count ? '  gravado.' : '  pulado — já não estava PENDENTE.');
  }
  if (!apply) console.log('\nNada gravado. Rode com --apply pra fechar.');
}

main().catch((e) => { console.error('Erro:', e?.message || e); process.exit(1); }).finally(() => prisma.$disconnect());
