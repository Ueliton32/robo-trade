/**
 * Checagem de estabilidade fora da amostra (walk-forward simplificado),
 * pra UMA combinação — pra rodar todas as combinações ao vivo de uma vez,
 * use `npm run stability:scan`.
 *
 * Por que isto existe: os limiares de cada estratégia (lib/strategies.ts —
 * ex: squeeze 0.65/0.5, ROC de exaustão 8%, etc.) foram ajustados olhando
 * pro resultado agregado do MESMO período de backtest usado depois pra
 * "validar" a estratégia. Ajuste e validação na mesma janela de dados é o
 * cenário clássico de overfitting/data snooping: um limiar pode parecer
 * bom só porque encaixou num sub-período de sorte, não porque captura um
 * padrão real e estável no tempo.
 *
 * Este script NÃO retreina nada — os limiares continuam fixos no código.
 * Ele só quebra o período pedido em N pedaços cronológicos e reporta as
 * métricas de CADA pedaço separadamente, ao lado do total. Se o resultado
 * bom do período inteiro estiver concentrado num pedaço só (ex: PF 2.5 no
 * primeiro terço e PF 0.6 nos outros dois), é sinal de que a estratégia —
 * do jeito que está calibrada agora — não é estável. Não é prova
 * definitiva (amostra pode ser pequena demais pra dizer qualquer coisa com
 * confiança), mas é o teste mais barato que existe pra desconfiar de um
 * resultado bom demais antes de aumentar exposição real numa combinação.
 *
 * Uso:
 *   npx tsx --require dotenv/config scripts/stability-check.ts --strategy=6 --pair=BTCUSDT --timeframe=1h --months=6
 *   (--splits=3 pra 3 pedaços em vez do padrão 2)
 */
import { STRATEGY_DEFS } from '../lib/strategies';
import { computeStability } from '../lib/stability-engine';

const MIN_TRADES_PER_BUCKET_FOR_VERDICT = 5;

function argValue(name: string): string | null {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
}

async function main() {
  const strategyId = parseInt(argValue('strategy') ?? '', 10);
  const pair = argValue('pair');
  const timeframe = argValue('timeframe');
  const months = Math.max(1, parseInt(argValue('months') ?? '6', 10) || 6);
  const splits = Math.max(2, parseInt(argValue('splits') ?? '2', 10) || 2);

  const strat = STRATEGY_DEFS.find((s) => s.id === strategyId);
  if (!strat || !pair || !timeframe) {
    console.error(
      'Uso: npx tsx --require dotenv/config scripts/stability-check.ts --strategy=N --pair=BTCUSDT --timeframe=1h [--months=6] [--splits=2]'
    );
    process.exit(1);
    return;
  }

  console.log(`Rodando backtest de ${months} ${months === 1 ? 'mês' : 'meses'} pra ${pair} × ${strat.name} × ${timeframe}...`);
  const r = await computeStability({ strategyId, pair, timeframe, months, splits });

  if (!r.totalTrades) {
    console.log('Nenhum trade resolvido nesse período — nada pra avaliar.');
    return;
  }

  if (r.totalTrades < splits * MIN_TRADES_PER_BUCKET_FOR_VERDICT) {
    console.log(
      `⚠️  Só ${r.totalTrades} trade(s) no período — amostra pequena demais pra dividir com confiança em ${splits} pedaço(s) ` +
      `(idealmente >= ${splits * MIN_TRADES_PER_BUCKET_FOR_VERDICT}). Aumente --months ou reduza --splits. O resultado abaixo é só informativo.`
    );
  }

  console.log('');
  console.log(`── Resultado (${r.totalTrades} trades) ──`);
  console.log(`  PF geral: ${r.overallPF.toFixed(2)}`);
  console.log(`  Pedaços:  [${r.bucketPFs.map((p) => p.toFixed(2)).join(', ')}]`);
  console.log('');

  switch (r.verdict) {
    case 'INSTAVEL':
      console.log(
        `⚠️  INSTÁVEL: o resultado geral (PF ${r.overallPF.toFixed(2)}) é positivo, mas pelo menos um pedaço teve PF < 1.0 — ` +
        `o edge pode estar concentrado num sub-período específico, não distribuído no tempo todo. Trate os limiares atuais dessa combinação com desconfiança antes de aumentar exposição real nela.`
      );
      break;
    case 'ALTA_VARIANCIA':
      console.log(
        `⚠️  ALTA VARIÂNCIA: PF varia bastante entre pedaços — mesmo com tudo >= 1.0, ` +
        `essa oscilação grande é típica de amostra pequena ou de regime de mercado mudando, não de um padrão estável.`
      );
      break;
    case 'ESTAVEL':
      console.log(
        `✅ ESTÁVEL: PF consistente entre pedaços — não garante nada sobre o futuro, ` +
        `mas não há sinal óbvio de que o resultado geral dependa de um único sub-período de sorte.`
      );
      break;
    case 'AMOSTRA_INSUFICIENTE':
      console.log('Pedaços de menos de 5 trades demais pra dar um veredito — rode com --months maior ou --splits menor.');
      break;
  }
}

main().catch((e) => {
  console.error('[stability-check] Falha:', e?.message ?? e);
  process.exit(1);
});
