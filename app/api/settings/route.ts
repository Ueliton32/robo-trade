export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ALL_AVAILABLE_PAIRS, STRATEGY_DEFS } from '@/lib/strategies';
import { recordVersionIfConfigChanged } from '@/lib/config-promotion';

const VALID_STRATEGY_IDS = STRATEGY_DEFS.map((s) => s.id) as [number, ...number[]];
const strategyId = z.number().int().refine((id) => VALID_STRATEGY_IDS.includes(id), 'ID de estratégia inválido');
const pair = z.string().refine((p) => ALL_AVAILABLE_PAIRS.includes(p), 'Par não suportado');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Formato esperado HH:MM');

// Limites deliberadamente conservadores — isto é o que trava, por exemplo,
// alguém salvar riskPerTradePercent: 100 sem querer (viraria "arriscar
// 100% do capital por trade" na calculadora do dashboard).
const settingsSchema = z.object({
  emailAlerts: z.boolean().optional(),
  alertEmail: z.string().email('E-mail inválido').nullish(),
  telegramAlerts: z.boolean().optional(),
  telegramChatId: z.string().max(64).nullish(),
  telegramStrategies: z.array(strategyId).optional(),
  monitoredPairs: z.array(pair).optional(),
  enabledStrategies: z.array(strategyId).optional(),
  emailStrategies: z.array(strategyId).optional(),
  pairStrategies: z.record(z.array(strategyId)).nullish(),
  pairStrategyTimeframes: z.record(z.record(z.array(z.string()))).nullish(),
  dayTradeStart: hhmm.optional(),
  dayTradeEnd: hhmm.optional(),
  tradeMode: z.enum(['day', 'swing', 'both']).optional(),
  accountCapital: z.number().positive().max(1_000_000_000).nullish(),
  // 0,1% a 5% por trade — fora dessa faixa quase certamente é erro de
  // digitação, não uma escolha real de risco.
  riskPerTradePercent: z.number().min(0.1).max(5).optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });
    const userId = (session.user as any)?.id;
    let settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) {
      settings = await prisma.userSettings.create({ data: { userId } });
    }
    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error('Settings error:', error);
    return NextResponse.json({ error: 'Erro ao buscar configura\u00e7\u00f5es' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'N\u00e3o autorizado' }, { status: 401 });
    const userId = (session.user as any)?.id;
    const rawBody = await request.json();

    const parsed = settingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Configura\u00e7\u00f5es inv\u00e1lidas', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // Snapshot de ANTES da mudança (Fase 10) — pra comparar com o
    // resultado do upsert e só versionar se algum dos 4 campos que
    // decidem o que o robô gera de fato mudou (preferências como
    // e-mail/Telegram/capital/risco não entram nessa comparação).
    const before = await prisma.userSettings.findUnique({ where: { userId } });

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        emailAlerts: body.emailAlerts,
        alertEmail: body.alertEmail,
        telegramAlerts: body.telegramAlerts,
        telegramChatId: body.telegramChatId,
        telegramStrategies: body.telegramStrategies,
        monitoredPairs: body.monitoredPairs,
        enabledStrategies: body.enabledStrategies,
        emailStrategies: body.emailStrategies,
        pairStrategies: body.pairStrategies ?? undefined,
        pairStrategyTimeframes: body.pairStrategyTimeframes ?? undefined,
        dayTradeStart: body.dayTradeStart,
        dayTradeEnd: body.dayTradeEnd,
        tradeMode: body.tradeMode,
        accountCapital: body.accountCapital,
        riskPerTradePercent: body.riskPerTradePercent,
      },
      create: { userId },
    });

    // Fase 10 — versiona só se pairStrategies/enabledStrategies/
    // monitoredPairs/pairStrategyTimeframes mudaram de verdade. Nunca
    // bloqueia o salvamento se isso falhar (é auditoria, não é crítico
    // pro settings em si).
    try {
      await recordVersionIfConfigChanged({
        userId,
        before,
        after: settings,
        reason: 'Alterado pela tela de Configurações.',
        changedVia: 'ui',
      });
    } catch (e: any) {
      console.error('[settings] Falha ao versionar mudança de config (Fase 10):', e?.message);
    }

    return NextResponse.json({ settings });
  } catch (error: any) {
    console.error('Settings update error:', error);
    const isSchemaIssue = error?.code === 'P2022' || /column|does not exist/i.test(error?.message ?? '');
    const message = isSchemaIssue
      ? 'O banco de dados est\u00e1 desatualizado em rela\u00e7\u00e3o ao c\u00f3digo — rode "npx prisma db push" no terminal e tente salvar de novo.'
      : `Erro ao salvar configura\u00e7\u00f5es: ${error?.message ?? 'erro desconhecido'}`;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
