# Plano de migration RLS — Supabase/Postgres

## Objetivo

Corrigir o advisor crítico `RLS Disabled in Public` sem quebrar o app Next.js/Prisma e sem expor dados via PostgREST/Supabase client.

Este documento é **plano**, não migration aplicada.

## Evidência atual

Advisor Supabase security em `2026-09-10`:

- `rls_disabled_in_public`
- nível: `ERROR`
- facing: `EXTERNAL`
- tabelas afetadas: 18

Tabelas afetadas:

- `Account`
- `BacktestScan`
- `ConfigVersion`
- `DivergenceStreak`
- `MLModel`
- `PilotActionLog`
- `RadarContextScan`
- `ReliabilitySnapshot`
- `RiskCircuitBreaker`
- `Session`
- `Signal`
- `StabilityScan`
- `StrategyStats`
- `StrategyWeight`
- `SystemState`
- `User`
- `UserSettings`
- `VerificationToken`

Policies atuais:

- `pg_policies`: 0 policies em `public`.

Grants atuais observados:

- `anon`, `authenticated` e `service_role` têm grants amplos (`SELECT`, `INSERT`, `UPDATE`, `DELETE`, etc.) nas tabelas públicas.
- Com RLS desativado, isso é exposição crítica se a API PostgREST estiver acessível.

Role usada pela aplicação local via Prisma:

```text
current_user: postgres
session_user: postgres
```

Implicação: o app server-side via Prisma tende a continuar operando após `ENABLE ROW LEVEL SECURITY`, porque o owner/superuser bypassa RLS quando `FORCE ROW LEVEL SECURITY` não é usado. Mesmo assim, isso precisa ser validado em staging/produção antes de aplicar.

## Decisão de desenho

O projeto usa autenticação NextAuth, não Supabase Auth. Os IDs de usuário são `cuid()`, não `auth.uid()` UUID do Supabase.

Portanto, **não criar policies baseadas em `auth.uid()` agora**, porque elas não mapeariam corretamente para `User.id`/`UserSettings.userId`.

Estratégia segura para v1:

1. Revogar acesso direto de `anon` e `authenticated` às tabelas públicas.
2. Habilitar RLS nas tabelas expostas.
3. Não criar policies de acesso direto para `anon`/`authenticated`.
4. Manter acesso da aplicação via Prisma server-side, com autorização feita pelas rotas NextAuth existentes.
5. Não usar `FORCE ROW LEVEL SECURITY` nesta primeira migration, para não quebrar Prisma/NextAuth.

## Migration proposta — v1 defensiva

> Aplicar somente após backup/snapshot e teste em branch/staging Supabase.

```sql
begin;

-- 1) Remover grants diretos perigosos de PostgREST/client roles.
revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;
revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all sequences in schema public from authenticated;

-- 2) Habilitar RLS nas tabelas públicas do app.
alter table public."Account" enable row level security;
alter table public."BacktestScan" enable row level security;
alter table public."ConfigVersion" enable row level security;
alter table public."DivergenceStreak" enable row level security;
alter table public."MLModel" enable row level security;
alter table public."PilotActionLog" enable row level security;
alter table public."RadarContextScan" enable row level security;
alter table public."ReliabilitySnapshot" enable row level security;
alter table public."RiskCircuitBreaker" enable row level security;
alter table public."Session" enable row level security;
alter table public."Signal" enable row level security;
alter table public."StabilityScan" enable row level security;
alter table public."StrategyStats" enable row level security;
alter table public."StrategyWeight" enable row level security;
alter table public."SystemState" enable row level security;
alter table public."User" enable row level security;
alter table public."UserSettings" enable row level security;
alter table public."VerificationToken" enable row level security;

commit;
```

## Policies explicitamente NÃO recomendadas nesta etapa

Não criar nesta v1:

```sql
using (auth.uid()::text = "userId")
```

Motivo: NextAuth não grava Supabase Auth UID em `User.id`. Isso criaria falsa sensação de isolamento ou bloquearia acessos legítimos caso o app passasse a usar PostgREST no futuro.

Também não criar policy pública de leitura para:

- `Signal`
- `StrategyStats`
- `BacktestScan`
- `RadarContextScan`
- `MLModel`
- `StrategyWeight`
- `ConfigVersion`

Motivo: mesmo dados “operacionais” podem revelar estratégia, histórico e configurações do robô.

## Validação antes de aplicar

1. Confirmar backup/snapshot Supabase.
2. Confirmar que produção realmente usa Prisma server-side, não Supabase client direto para tabelas públicas.
3. Confirmar env de produção Vercel e database role antes da aplicação.
4. Rodar em branch/staging Supabase primeiro.
5. Executar smoke tests:
   - login NextAuth;
   - dashboard carrega;
   - `/api/settings` GET/POST autenticado;
   - `/api/signals` autenticado;
   - scheduler cycle em SHADOW/PAPER sem live orders;
   - monitoramento diário;
   - `npm run test`;
   - `npx tsc --noEmit`;
   - `npm run build`.
6. Rodar Supabase Advisor novamente e exigir redução do erro `rls_disabled_in_public` para 0.
7. Validar que `anon` não lê tabelas via PostgREST.

## Query de verificação pós-migration

```sql
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;
```

## Rollback de emergência

Rollback só se app quebrar após aplicação e não houver correção rápida de connection role.

```sql
begin;

alter table public."Account" disable row level security;
alter table public."BacktestScan" disable row level security;
alter table public."ConfigVersion" disable row level security;
alter table public."DivergenceStreak" disable row level security;
alter table public."MLModel" disable row level security;
alter table public."PilotActionLog" disable row level security;
alter table public."RadarContextScan" disable row level security;
alter table public."ReliabilitySnapshot" disable row level security;
alter table public."RiskCircuitBreaker" disable row level security;
alter table public."Session" disable row level security;
alter table public."Signal" disable row level security;
alter table public."StabilityScan" disable row level security;
alter table public."StrategyStats" disable row level security;
alter table public."StrategyWeight" disable row level security;
alter table public."SystemState" disable row level security;
alter table public."User" disable row level security;
alter table public."UserSettings" disable row level security;
alter table public."VerificationToken" disable row level security;

-- Restaurar grants só se necessário e temporariamente.
-- Preferir corrigir app/role em vez de devolver grants amplos.

commit;
```

## Próxima decisão necessária

Antes de aplicar esta migration em Supabase real, preciso executar a etapa 3 da ordem combinada: reautenticar/verificar Vercel no escopo `ueliton32s-projects`, porque precisamos confirmar produção, env e role efetiva antes de mexer em segurança do banco.
