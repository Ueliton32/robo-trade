// Item 5 da rodada de melhoria de 03/09/2026 — risco de correlação entre
// estratégias: nada impedia 2-3 estratégias dispararem LONG simultâneo em
// vários pares que tendem a mover juntos (majors de cripto sobretudo),
// então o "tamanho da aposta" real do robô num movimento de mercado só
// nunca aparecia — cada sinal parecia isolado, mas na prática pode ser a
// mesma aposta direcional repetida várias vezes.
//
// Isto é DELIBERADAMENTE só monitoramento — alerta, não bloqueia geração
// de sinal. Mudar a lógica de geração pra impedir sinal correlacionado é
// uma mudança de comportamento maior, que merece validação própria (tipo
// tudo o resto nesse projeto) antes de rodar sozinha em produção.
import { prisma } from './prisma';
import { logPilotEvent } from './pilot-log';

// Threshold simples e honesto: conta quantos PARES DIFERENTES têm sinal
// PENDENTE na mesma direção ao mesmo tempo — não é uma matriz de
// correlação de verdade (isso pediria histórico de preço correlacionado,
// mais complexo), é uma proxy direta e defensável pra "quantas apostas
// direcionais simultâneas o robô tem abertas agora".
const CONCURRENT_SAME_DIRECTION_ALERT_THRESHOLD = 5;

export interface CorrelationExposureResult {
  longPairs: string[];
  shortPairs: string[];
  maxExposure: number;
  alertTriggered: boolean;
}

// Só calcula — sem efeito colateral. Usado tanto pelo ciclo (que decide se
// loga) quanto pela rota de status (que só quer mostrar o número atual,
// sem gravar nada toda vez que o dashboard atualizar a tela).
export async function computeCorrelationExposure(): Promise<CorrelationExposureResult> {
  const pending = await prisma.signal.findMany({
    where: { status: 'PENDENTE', source: 'live' },
    select: { pair: true, direction: true },
  });

  const longPairs = Array.from(new Set(pending.filter((s) => s.direction === 'LONG').map((s) => s.pair)));
  const shortPairs = Array.from(new Set(pending.filter((s) => s.direction === 'SHORT').map((s) => s.pair)));
  const maxExposure = Math.max(longPairs.length, shortPairs.length);
  const alertTriggered = maxExposure >= CONCURRENT_SAME_DIRECTION_ALERT_THRESHOLD;

  return { longPairs, shortPairs, maxExposure, alertTriggered };
}

// Calcula E loga se cruzar o limite — só deve ser chamado do ciclo
// (lib/cycle-runner.ts), que já é naturalmente limitado a 1x por ciclo
// (~15 min), não de rota consultada com frequência pelo dashboard.
export async function checkCorrelationExposure(): Promise<CorrelationExposureResult> {
  const result = await computeCorrelationExposure();

  if (result.alertTriggered) {
    const direction = result.longPairs.length >= result.shortPairs.length ? 'LONG' : 'SHORT';
    const pairs = direction === 'LONG' ? result.longPairs : result.shortPairs;
    await logPilotEvent(
      'CORRELATION_EXPOSURE',
      `${pairs.length} pares diferentes com sinal ${direction} pendente ao mesmo tempo (${pairs.join(', ')}) — ` +
      `pode ser a mesma aposta direcional repetida em pares correlacionados, não ${pairs.length} oportunidades independentes.`
    );
  }

  return result;
}
