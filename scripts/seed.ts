import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Test account
  const hash = await bcrypt.hash('Ig4EW3@u1j', 10);
  const testUser = await prisma.user.upsert({
    where: { email: 'abacus-f2ac3d00@example.com' },
    update: {},
    create: {
      email: 'abacus-f2ac3d00@example.com',
      password: hash,
      name: 'Admin Trader',
      role: 'admin',
    },
  });

  await prisma.userSettings.upsert({
    where: { userId: testUser.id },
    update: {},
    create: {
      userId: testUser.id,
      emailAlerts: true,
      alertEmail: 'abacus-f2ac3d00@example.com',
    },
  });

  // Strategy Stats — nasce ZERADA. Nada de números inventados: os valores
  // reais (win rate, profit factor, drawdown, etc.) só existem depois que o
  // robô gera sinais de verdade e o job de recalculo (lib/stats-engine.ts)
  // os fecha com dados reais da Binance. Ver POST /api/strategies/analyze
  // e POST /api/strategies/recalculate.
  const strategies = [
    { strategyId: 1, strategyName: 'Rompimento de Range', description: 'Identifica consolidações (ranges) e alerta quando o preço rompe com volume acima da média e Open Interest crescente.' },
    { strategyId: 2, strategyName: 'Pullback na EMA20', description: 'Monitora tendência com Price Action e aguarda retração até EMA20 com confirmação de rejeição por candle.' },
    { strategyId: 3, strategyName: 'Trap de Liquidez', description: 'Identifica áreas de liquidez (máximas/mínimas relevantes) e detecta fakeouts com volume spike e reversão rápida.' },
    { strategyId: 4, strategyName: 'Funding Extremo', description: 'Monitora Funding Rate em tempo real e alerta quando está extremamente positivo ou negativo, combinando com Open Interest.' },
    { strategyId: 5, strategyName: 'Reversão após Liquidação', description: 'Monitora variação brusca de preço para detectar eventos de liquidação em massa e possível reversão.' },
    { strategyId: 6, strategyName: 'Compressão de Volatilidade', description: 'Calcula ATR para identificar squeezes de volatilidade e alerta para direção provável de breakout com volume.' },
  ];

  for (const strat of strategies) {
    await prisma.strategyStats.upsert({
      where: { strategyId: strat.strategyId },
      update: {},
      create: {
        ...strat,
        winRate: 0,
        payoff: 0,
        profitFactor: 0,
        maxDrawdown: 0,
        expectancy: 0,
        bestAssets: [],
        bestHours: [],
        bestTimeframes: [],
        totalTrades: 0,
        wins: 0,
        losses: 0,
      },
    });
  }

  // Sinal de exemplo, só para a UI não ficar vazia no primeiro acesso.
  // source: 'demo' e status: 'DEMO' garantem que ele NUNCA entra no cálculo
  // de estatísticas reais (ver lib/stats-engine.ts, que só olha source:'live').
  const demoSignalExists = await prisma.signal.findFirst({ where: { source: 'demo' } });
  if (!demoSignalExists) {
    await prisma.signal.create({
      data: {
        strategyId: 3,
        strategyName: 'Trap de Liquidez',
        pair: 'SOLUSDT',
        direction: 'LONG',
        timeframe: '15m',
        mode: 'Day Trade',
        entryPrice: 145.20,
        target1: 149.50,
        target2: 154.00,
        stopLoss: 142.00,
        leverage: '5x-10x',
        confidence: 75,
        reason: '[EXEMPLO ILUSTRATIVO — não é um sinal real] Trap de liquidez abaixo de nível chave.',
        status: 'DEMO',
        result: null,
        pnlPercent: null,
        source: 'demo',
      },
    });
  }

  console.log('Seed concluído com sucesso! Estatísticas zeradas — serão preenchidas com sinais reais conforme o robô operar.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
