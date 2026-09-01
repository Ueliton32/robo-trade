export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Hobby permite até 60s de execução com isso configurado
import { NextResponse } from 'next/server';
import { runSignalCycle } from '@/lib/cycle-runner';

// Rota protegida por segredo (não por sessão de login) — pensada pra ser
// chamada por um agendador EXTERNO (GitHub Actions, Vercel Cron), não por
// um usuário logado no navegador. Faz exatamente o que scripts/scheduler.ts
// faz a cada ciclo, mas sob demanda via HTTP em vez de processo contínuo —
// pra quem não quer manter servidor próprio ligado 24/7.
//
// Convenção do header (Authorization: Bearer <segredo>) é a mesma que o
// Vercel Cron usa nativamente, então essa rota funciona também se um dia
// você trocar o gatilho externo (GitHub Actions) pelo Vercel Cron sem
// precisar mudar nada aqui.
//
// NÃO roda o stability-scan semanal (ver lib/cycle-runner.ts) — isso é
// pesado demais pra uma função serverless. Ver
// .github/workflows/weekly-stability-scan.yml.
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // sem segredo configurado no servidor, recusa tudo — nunca abre a rota sem querer
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const intervalMinutes = Math.max(1, parseInt(process.env.SCHEDULER_INTERVAL_MINUTES ?? '15', 10) || 15);
  const result = await runSignalCycle(intervalMinutes);

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
