// Processo de promoção versionado com rollback (Fase 10, 05/09/2026).
//
// O que isto resolve: até aqui, toda mudança na configuração ao vivo
// (quais estratégias rodam em qual par — scripts/promote-*.ts,
// scripts/pause-pullback-ema20.ts, ou a própria tela de Configurações)
// sobrescrevia UserSettings direto, sem deixar rastro nenhum além do
// histórico do script no git. Não dava pra responder "o que era antes
// dessa mudança?" nem "como eu desfaço isso?" sem lembrar de cabeça ou ler
// código antigo. Este módulo é o ÚNICO caminho recomendado, daqui pra
// frente, pra mudar o que o robô roda — ele nunca aplica uma mudança sem
// também gravar uma versão auditável dela.
//
// Só os 4 campos que decidem O QUE O ROBÔ GERA (monitoredPairs,
// enabledStrategies, pairStrategies, pairStrategyTimeframes) são
// versionados aqui — preferências (alerta de e-mail/Telegram, capital,
// risco por trade) continuam sendo só um UPDATE normal em UserSettings,
// não são "promoção" de comportamento de trading.
import { prisma } from './prisma';
import { Prisma } from '@prisma/client';

export interface ConfigSnapshot {
  monitoredPairs: string[];
  enabledStrategies: number[];
  pairStrategies: Record<string, number[]> | null;
  pairStrategyTimeframes: Record<string, Record<string, string[]>> | null;
}

// Prisma trata `null` explícito em campo Json? como precisando do marcador
// especial `Prisma.JsonNull` — passar `null` puro dá erro de tipo no
// `.create()`. Esta função só converte os `null`s do nosso ConfigSnapshot
// pro formato que o Prisma exige ao gravar em ConfigVersion.
function jsonOrNull(v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return v === null || v === undefined ? Prisma.JsonNull : (v as Prisma.InputJsonValue);
}

function snapshotFromSettings(s: {
  monitoredPairs: string[];
  enabledStrategies: number[];
  pairStrategies: unknown;
  pairStrategyTimeframes: unknown;
}): ConfigSnapshot {
  return {
    monitoredPairs: s.monitoredPairs ?? [],
    enabledStrategies: s.enabledStrategies ?? [1, 2, 3, 4, 5, 6],
    pairStrategies: (s.pairStrategies as Record<string, number[]> | null) ?? null,
    pairStrategyTimeframes: (s.pairStrategyTimeframes as Record<string, Record<string, string[]>> | null) ?? null,
  };
}

function snapshotsEqual(a: ConfigSnapshot, b: ConfigSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Recebe explicitamente o client (prisma normal OU `tx` de dentro de uma
// transação) — nunca usa o client global de dentro de uma transação, pra
// não ler um estado desatualizado nem arriscar dois processos calculando
// o mesmo "próximo número" ao mesmo tempo (baixo risco aqui, uso manual e
// pouco frequente, mas sem custo nenhum fazer certo).
async function nextVersionNumber(db: Prisma.TransactionClient, userId: string): Promise<number> {
  const last = await db.configVersion.findFirst({
    where: { userId },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return (last?.version ?? 0) + 1;
}

/**
 * Garante que existe pelo menos uma versão (a "v1 baseline") pra um
 * usuário — captura o estado ATUAL sem mudar nada, só pra ter um ponto de
 * partida versionado antes da primeira promoção de verdade. Idempotente.
 */
export async function ensureBaselineVersion(userId: string): Promise<{ created: boolean; version: number }> {
  const existing = await prisma.configVersion.findFirst({ where: { userId }, orderBy: { version: 'desc' } });
  if (existing) return { created: false, version: existing.version };

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings) throw new Error(`UserSettings não encontrado pra userId ${userId}`);

  const snap = snapshotFromSettings(settings);
  const version = 1;
  const row = await prisma.configVersion.create({
    data: {
      userId,
      version,
      monitoredPairs: snap.monitoredPairs,
      enabledStrategies: snap.enabledStrategies,
      pairStrategies: jsonOrNull(snap.pairStrategies),
      pairStrategyTimeframes: jsonOrNull(snap.pairStrategyTimeframes),
      reason: 'Baseline — estado capturado ao ativar o sistema de versionamento (Fase 10), sem nenhuma mudança de comportamento.',
      changedVia: 'baseline',
    },
  });
  return { created: true, version: row.version };
}

/**
 * Ponto único recomendado pra QUALQUER script futuro que precise mudar
 * quais estratégias/pares rodam ao vivo. Aplica a mudança em UserSettings
 * E grava a versão nova, na mesma transação — nunca uma sem a outra.
 * `reason` é sempre obrigatório.
 */
export async function promoteConfigChange(params: {
  userId: string;
  newSettings: Partial<ConfigSnapshot>;
  reason: string;
  changedVia: string;
}): Promise<{ version: number; changed: boolean }> {
  const reason = params.reason?.trim();
  if (!reason) throw new Error('promoteConfigChange exige `reason` (motivo da mudança) — nunca vazio.');

  return prisma.$transaction(async (tx) => {
    const current = await tx.userSettings.findUnique({ where: { userId: params.userId } });
    if (!current) throw new Error(`UserSettings não encontrado pra userId ${params.userId}`);

    const before = snapshotFromSettings(current);
    const after: ConfigSnapshot = { ...before, ...params.newSettings };

    if (snapshotsEqual(before, after)) {
      // Nada mudou de fato — não polui o histórico com uma versão idêntica
      // à anterior.
      const last = await tx.configVersion.findFirst({ where: { userId: params.userId }, orderBy: { version: 'desc' } });
      return { version: last?.version ?? 0, changed: false };
    }

    await tx.userSettings.update({
      where: { userId: params.userId },
      data: {
        monitoredPairs: after.monitoredPairs,
        enabledStrategies: after.enabledStrategies,
        pairStrategies: after.pairStrategies ?? undefined,
        pairStrategyTimeframes: after.pairStrategyTimeframes ?? undefined,
      },
    });

    const version = await nextVersionNumber(tx, params.userId);
    await tx.configVersion.create({
      data: {
        userId: params.userId,
        version,
        monitoredPairs: after.monitoredPairs,
        enabledStrategies: after.enabledStrategies,
        pairStrategies: jsonOrNull(after.pairStrategies),
        pairStrategyTimeframes: jsonOrNull(after.pairStrategyTimeframes),
        reason,
        changedVia: params.changedVia,
      },
    });

    return { version, changed: true };
  });
}

/**
 * Usado pela rota da tela de Configurações (app/api/settings/route.ts):
 * o UPDATE em si já foi feito pela rota (upsert normal); esta função só
 * verifica se algum dos 4 campos que afetam geração de sinal mudou de
 * verdade e, se sim, grava a versão — sem tocar em UserSettings de novo.
 * Preferências (alerta, capital, risco) não passam por aqui.
 */
export async function recordVersionIfConfigChanged(params: {
  userId: string;
  before: { monitoredPairs: string[]; enabledStrategies: number[]; pairStrategies: unknown; pairStrategyTimeframes: unknown } | null;
  after: { monitoredPairs: string[]; enabledStrategies: number[]; pairStrategies: unknown; pairStrategyTimeframes: unknown };
  reason: string;
  changedVia: string;
}): Promise<{ version: number; changed: boolean }> {
  const beforeSnap = params.before ? snapshotFromSettings(params.before) : null;
  const afterSnap = snapshotFromSettings(params.after);

  if (beforeSnap && snapshotsEqual(beforeSnap, afterSnap)) {
    return { version: 0, changed: false };
  }

  const version = await nextVersionNumber(prisma, params.userId);
  await prisma.configVersion.create({
    data: {
      userId: params.userId,
      version,
      monitoredPairs: afterSnap.monitoredPairs,
      enabledStrategies: afterSnap.enabledStrategies,
      pairStrategies: jsonOrNull(afterSnap.pairStrategies),
      pairStrategyTimeframes: jsonOrNull(afterSnap.pairStrategyTimeframes),
      reason: params.reason,
      changedVia: params.changedVia,
    },
  });
  return { version, changed: true };
}

/**
 * Restaura uma versão antiga como a configuração ao vivo atual. Nunca
 * apaga nem edita histórico: cria uma versão NOVA cujo conteúdo é igual
 * ao da versão restaurada, com rolledBackFrom marcando de onde veio.
 */
export async function rollbackToVersion(params: {
  userId: string;
  targetVersion: number;
  note: string;
}): Promise<{ version: number }> {
  const note = params.note?.trim();
  if (!note) throw new Error('rollbackToVersion exige `note` (motivo do rollback) — nunca vazio.');

  const target = await prisma.configVersion.findUnique({
    where: { userId_version: { userId: params.userId, version: params.targetVersion } },
  });
  if (!target) throw new Error(`Versão ${params.targetVersion} não encontrada pro usuário ${params.userId}.`);

  return prisma.$transaction(async (tx) => {
    await tx.userSettings.update({
      where: { userId: params.userId },
      data: {
        monitoredPairs: target.monitoredPairs as unknown as string[],
        enabledStrategies: target.enabledStrategies as unknown as number[],
        pairStrategies: target.pairStrategies ?? undefined,
        pairStrategyTimeframes: target.pairStrategyTimeframes ?? undefined,
      },
    });

    const version = await nextVersionNumber(tx, params.userId);
    await tx.configVersion.create({
      data: {
        userId: params.userId,
        version,
        monitoredPairs: target.monitoredPairs as unknown as string[],
        enabledStrategies: target.enabledStrategies as unknown as number[],
        pairStrategies: jsonOrNull(target.pairStrategies),
        pairStrategyTimeframes: jsonOrNull(target.pairStrategyTimeframes),
        reason: `Rollback pra versão ${params.targetVersion}: ${note}`,
        changedVia: 'rollback',
        rolledBackFrom: params.targetVersion,
      },
    });

    return { version };
  });
}

export async function listVersions(userId: string, limit: number = 20) {
  return prisma.configVersion.findMany({ where: { userId }, orderBy: { version: 'desc' }, take: limit });
}
