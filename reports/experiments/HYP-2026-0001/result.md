# Experimento HYP-2026-0001 — npm audit vulnerability remediation

## Branch isolada

`experiment/HYP-2026-0001-audit-fix`

## Baseline antes da mudança

- `npm audit --json`: exit code 1
- Vulnerabilidades conhecidas no baseline: 25 total, incluindo 14 high e 4 critical.
- Baseline técnico após instalar dependências no worktree: `npm run test && npx tsc --noEmit && npm run lint && npm run build` passou.

Arquivos de evidência:

- `baseline-npm-audit.json`
- `baseline-npm-audit-after-install.json`

## Mudança aplicada

Correção de dependências via `npm audit fix --force`, seguida de alinhamento dos peers de lint e instalação reproduzível por CI:

- `next`: `14.2.28` → `^16.3.4`
- `next-auth`: `4.24.11` → `^4.24.15`
- `nodemailer`: `6.9.16` → `^10.0.3`
- `node-cron`: `3.0.3` → `^4.6.0`
- `maplibre-gl`: `4.7.1` → `^6.9.0`
- `lodash`: `4.17.21` → `^4.18.1`
- `postcss`: `8.4.30` → `^8.5.28`
- `webpack`: `5.99.5` → `^5.110.3`
- `csv`: `6.3.11` → `^6.6.3`
- `react-use`: `17.6.0` → `^17.6.1`
- `@typescript-eslint/*`: `7.0.0` → `^8.70.0`
- `eslint`: `9.24.0` → `^9.39.5`
- `eslint-plugin-react-hooks`: `4.6.0` → `^7.1.1`

Ajustes de compatibilidade:

- `lib/mailer.ts`: troca de namespace `nodemailer.Transporter` por import type explícito `Transporter`, necessário em `nodemailer@10`.
- `next.config.js`: remoção da chave `eslint`, obsoleta/inválida no Next 16; lint permanece separado via `npm run lint`.
- `.npmrc`: `legacy-peer-deps=true` para tornar `npm ci` reproduzível diante do peer opcional `next-auth` x `nodemailer@10`.
- `tsconfig.json`: ajustes aplicados pelo Next 16 durante build (`jsx: react-jsx`, include `.next/dev/types/**/*.ts`).

## Resultado pós-mudança

Comandos executados e verificados:

```text
npm ci                         OK
npm run test                   OK — 23 testes passaram
npx tsc --noEmit               OK
npm run lint                   OK
npm run build                  OK — Next.js 16.3.4 / Turbopack compilou
npm audit --audit-level=high   OK — found 0 vulnerabilities
npm run monitoring:daily       OK — status OK
node-cron API check            OK — schedule/validate disponíveis; cron */15 válido
```

Arquivo de evidência pós-correção:

- `postfix-npm-audit.json`

## Resultado negativo / riscos observados

- Upgrade de `next` para 16 é major e exige validação de produção antes de merge/deploy.
- Upgrade de `nodemailer` para 10 entra em conflito peer opcional com `next-auth@4.24.15`; resolvido operacionalmente com `.npmrc legacy-peer-deps=true`, mas deve ser revisado antes de produção.
- `node-cron` foi para major 4; API básica validada, mas o scheduler real não foi executado no branch experimental para evitar escrita no banco.
- `plotly.js` foi ajustado para `^2.34.0` pelo audit fix, apesar do projeto usar `2.35.3` antes; build passou, mas tela de radar/backtest precisa QA visual antes de merge.

## Conclusão

Hipótese validada tecnicamente em branch isolada: o projeto pode zerar o `npm audit --audit-level=high` mantendo testes, typecheck, lint, build, `npm ci` e monitoramento diário passando.

Status recomendado para backlog: `VALIDATED`, pendente de revisão humana antes de merge/deploy.
