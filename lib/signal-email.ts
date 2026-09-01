import { sendEmail } from '@/lib/mailer';
import { SignalData } from '@/lib/strategies';
import { formatPrice } from '@/lib/utils';

export async function sendSignalEmail(signal: SignalData, email: string): Promise<void> {
  const dirColor = signal.direction === 'LONG' ? '#22c55e' : '#ef4444';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e1a; color: #fff; padding: 24px; border-radius: 12px;">
      <h2 style="color: #f0b90b; border-bottom: 2px solid #f0b90b; padding-bottom: 10px;">🤖 Robô Trade - Novo Sinal</h2>
      <div style="background: #1a1f2e; padding: 20px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 8px 0;"><strong>Estratégia:</strong> ${signal.strategyName}</p>
        <p style="margin: 8px 0;"><strong>Par:</strong> ${signal.pair}</p>
        <p style="margin: 8px 0;"><strong>Direção:</strong> <span style="color: ${dirColor}; font-weight: bold;">${signal.direction}</span></p>
        <p style="margin: 8px 0;"><strong>Timeframe:</strong> ${signal.timeframe}</p>
        <p style="margin: 8px 0;"><strong>Modo:</strong> ${signal.mode}</p>
        <hr style="border-color: #333; margin: 12px 0;" />
        <p style="margin: 8px 0;"><strong>Entrada:</strong> ${formatPrice(signal.entryPrice)}</p>
        <p style="margin: 8px 0;"><strong>Alvo 1:</strong> ${formatPrice(signal.target1)}</p>
        <p style="margin: 8px 0;"><strong>Alvo 2:</strong> ${formatPrice(signal.target2)}</p>
        <p style="margin: 8px 0;"><strong>Stop Loss:</strong> ${formatPrice(signal.stopLoss)}</p>
        <p style="margin: 8px 0;"><strong>Alavancagem:</strong> ${signal.leverage}</p>
        <p style="margin: 8px 0;"><strong>Confiança:</strong> ${signal.confidence}%</p>
        <hr style="border-color: #333; margin: 12px 0;" />
        <p style="margin: 8px 0;"><strong>Motivo:</strong> ${signal.reason}</p>
      </div>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: `🤖 ${signal.direction} ${signal.pair} - ${signal.strategyName}`,
    html,
  });
}

type SignalOutcome = 'WIN' | 'LOSS' | 'TARGET2';

interface ClosedSignalLike {
  pair: string;
  direction: string;
  strategyName: string;
  entryPrice: number;
  target1: number;
  target2: number;
  stopLoss: number;
  pnlPercent: number | null;
}

export async function sendOutcomeEmail(signal: ClosedSignalLike, email: string, outcome: SignalOutcome): Promise<void> {
  const pnl = signal.pnlPercent ?? 0;
  const pnlText = `${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}%`;
  const pnlColor = pnl >= 0 ? '#22c55e' : '#ef4444';

  let title: string;
  let levelLine: string;
  if (outcome === 'WIN') {
    title = '🎯 Alvo 1 atingido!';
    levelLine = `<p style="margin: 8px 0;"><strong>Saída:</strong> ${formatPrice(signal.target1)}</p>`;
  } else if (outcome === 'LOSS') {
    title = '🔴 Stop atingido';
    levelLine = `<p style="margin: 8px 0;"><strong>Saída:</strong> ${formatPrice(signal.stopLoss)}</p>`;
  } else {
    title = '🚀 Alvo 2 também atingido!';
    levelLine = `<p style="margin: 8px 0;"><strong>Alvo 2:</strong> ${formatPrice(signal.target2)}</p>`;
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0e1a; color: #fff; padding: 24px; border-radius: 12px;">
      <h2 style="color: #f0b90b; border-bottom: 2px solid #f0b90b; padding-bottom: 10px;">${title}</h2>
      <div style="background: #1a1f2e; padding: 20px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 8px 0;"><strong>Par:</strong> ${signal.pair} (${signal.direction})</p>
        <p style="margin: 8px 0;"><strong>Estratégia:</strong> ${signal.strategyName}</p>
        <p style="margin: 8px 0;"><strong>Entrada:</strong> ${formatPrice(signal.entryPrice)}</p>
        ${levelLine}
        ${outcome !== 'TARGET2'
          ? `<p style="margin: 8px 0;"><strong>Resultado:</strong> <span style="color: ${pnlColor}; font-weight: bold;">${pnlText}</span></p>`
          : `<p style="margin: 8px 0; opacity: 0.7;"><em>(resultado já contabilizado no alvo 1)</em></p>`}
      </div>
    </div>
  `;

  await sendEmail({
    to: email,
    subject: `${title} — ${signal.pair} (${signal.strategyName})`,
    html,
  });
}
