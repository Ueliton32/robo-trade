# Robô Trade

App de sinais de cripto multi-estratégia para Binance Futures. Dashboard com 6
estratégias independentes de Price Action / Estrutura de Mercado / Liquidez /
Open Interest / Funding Rate / Volume — mais estatísticas reais de
performance e um agendador que roda o robô sozinho em background.

Este projeto **não depende mais da Abacus**. Roda em qualquer lugar que tenha
Docker (ou Node + Postgres): sua própria máquina, uma VPS, Railway, Render,
Fly.io, etc.

> ⚠️ Se este projeto já foi usado dentro da Abacus, o `DATABASE_URL` antigo
> apontava para o Postgres **gerenciado por eles** (`hosteddb.reai.io`) — ele
> não vai continuar acessível fora da plataforma. Este projeto já vem
> configurado para subir seu **próprio** Postgres via Docker Compose. Se
> quiser preservar o histórico de sinais antigo, veja "Migrando dados
> antigos" no fim deste arquivo.

---

## Rodando com Docker (recomendado — um comando só)

Pré-requisito: [Docker](https://docs.docker.com/get-docker/) instalado.

```bash
docker compose up -d
```

Isso sobe três serviços:
- **postgres** — banco de dados, com volume persistente
- **app** — o dashboard, em http://localhost:3000
- **scheduler** — o robô rodando sozinho em background (fecha sinais e gera novos a cada `SCHEDULER_INTERVAL_MINUTES`, padrão 15 min)

Login de teste criado pelo seed:
- **email:** `abacus-f2ac3d00@example.com`
- **senha:** `Ig4EW3@u1j`

(Troque essa senha ou crie sua própria conta em `/signup` assim que entrar.)

Para acompanhar os logs do robô rodando sozinho:
```bash
docker compose logs -f scheduler
```

Para parar tudo: `docker compose down` (os dados do Postgres continuam no volume). Para apagar tudo, inclusive o banco: `docker compose down -v`.

---

## Rodando sem Docker (Node + seu próprio Postgres)

Pré-requisitos: Node.js 20+, um Postgres acessível (local ou na nuvem).

```bash
npm install
```

Edite o `.env` e aponte `DATABASE_URL` para o seu Postgres. Depois:

```bash
npx prisma db push      # cria as tabelas
npm run db:seed         # popula estratégias (zeradas) + conta de teste
npm run build
npm start                # sobe o dashboard em http://localhost:3000
```

Em **outro terminal**, para o robô rodar sozinho em background:

```bash
npm run scheduler
```

Deixe esse segundo processo rodando (em produção, use `pm2`, `systemd` ou
similar para mantê-lo vivo e reiniciar sozinho se cair). Sem ele, o robô só
analisa o mercado quando alguém clica em "Analisar Agora" no dashboard.

Para desenvolvimento com hot-reload: `npm run dev` no lugar de `build`+`start`.

---

## Alertas por e-mail (opcional)

O envio de e-mail agora é via SMTP puro (nenhuma dependência externa). Sem
configurar SMTP, o app funciona 100% normal — só não manda e-mail; os sinais
continuam aparecendo no dashboard.

Preencha no `.env`:

```
SMTP_HOST=smtp.seuservico.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=seu_usuario
SMTP_PASS=sua_senha
EMAIL_FROM="Robô Trade <noreply@seudominio.com>"
```

Funciona com Gmail (usando uma "senha de app"), Resend, SendGrid, Mailtrap
(para testar), ou qualquer provedor SMTP.

---

## Alertas por Telegram (opcional)

1. No Telegram, procure o bot **@BotFather** e mande `/newbot`. Siga as
   instruções (nome e username do seu bot) — ele te devolve um **token**
   parecido com `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.
2. Cole esse token em `TELEGRAM_BOT_TOKEN` no `.env`.
3. Reinicie o app (`npm run dev` de novo, ou `docker compose restart app scheduler`).
4. No Telegram, abra uma conversa com o **seu** bot (procure pelo username
   que você escolheu) e mande qualquer mensagem, tipo "oi".
5. No dashboard, vá em **Configurações → Alertas por Telegram**, ative o
   switch, clique em **"Buscar"** — o Chat ID da sua conversa aparece
   listado, é só clicar pra preencher.
6. Clique em **"Testar"** pra confirmar que a mensagem chega. Depois
   escolha quais estratégias mandam alerta e clique em **Salvar**.

Sem configurar `TELEGRAM_BOT_TOKEN`, o app funciona 100% normal — só não
manda alerta por Telegram.

---

## Moedas monitoradas, estratégia por moeda e tiers de volatilidade

O app agora suporta ~21 moedas (antes eram 5 fixas). Em **Configurações →
Pares Monitorados**, escolha quais acompanhar; em **Estratégia por Moeda**,
opcionalmente restrinja quais das 6 estratégias rodam em cada uma
(por padrão, todas rodam em todas). O botão "Aplicar sugestão da pesquisa"
preenche essa tabela com uma sugestão baseada em pesquisa de mercado trazida
pelo usuário do projeto — é uma tradução nossa das categorias do documento
pras nossas 6 estratégias, **não validada por backtest ainda**. Teste na aba
Backtest antes de confiar de olhos fechados.

O cálculo de stop também passou a levar em conta um "tier" de volatilidade
por moeda (alta liquidez / intermediária / alta volatilidade), aplicando um
multiplicador extra só na margem de segurança baseada em ATR (nunca no ponto
estrutural de invalidação nem no alvo) — moedas mais arriscadas ganham uma
margem um pouco maior contra caudas gordas que o ATR recente não captura
sozinho. Isso também é uma hipótese de pesquisa, testável comparando
backtests antes/depois em `lib/strategies.ts` (`STOP_TIER_MULTIPLIER`).

⚠️ PEPE é listado na Binance Futures como `1000PEPEUSDT` (contrato
representa 1000 unidades) — já configurado certo no app. Algumas moedas mais
novas (ex: HYPE) podem não estar disponíveis em todas as contas/regiões —
se uma moeda nunca gerar sinal nem aparecer no card de mercado, verifique se
ela realmente está listada na Binance Futures pra sua conta.

---

## Como o agendador funciona

`scripts/scheduler.ts` é um processo Node separado do servidor web — não
depende de cron externo, Vercel Cron, nem nada da Abacus. Ele mesmo conta o
tempo (`node-cron`) e, a cada ciclo:

1. Roda as 6 estratégias contra os pares monitorados (a união do que todos
   os usuários configuraram, ou os pares padrão se ninguém configurou nada).
2. Salva sinais novos e notifica por e-mail quem tiver alertas ligados.
3. Verifica sinais pendentes contra o histórico real de candles da Binance —
   fecha como WIN/LOSS os que já bateram no alvo ou no stop.
4. Recalcula as estatísticas (win rate, profit factor, drawdown etc.) a
   partir **somente** de sinais reais fechados.

Ajuste o intervalo em `SCHEDULER_INTERVAL_MINUTES` no `.env` (padrão: 15).

O botão "Analisar Agora" no dashboard e o botão "Recalcular" na tela de
Estatísticas fazem a mesma coisa sob demanda, então o app funciona mesmo que
você opte por não rodar o agendador.

---

## Rodando sem servidor próprio (GitHub Actions + Vercel, de graça)

Alternativa ao `scripts/scheduler.ts` como processo contínuo: publique o app
numa plataforma serverless (ex: [Vercel](https://vercel.com), grátis pra uso
pessoal) e deixe um **GitHub Actions agendado** chamar o ciclo por HTTP a
cada 15 minutos — sem precisar de VPS nem processo seu ligado 24/7.

A lógica de cada ciclo vive em `lib/cycle-runner.ts`, compartilhada entre o
`scheduler.ts` (processo contínuo) e a rota `GET /api/cron/run-cycle`
(chamada sob demanda). O stability-scan semanal fica de fora desse ciclo de
propósito — ele roda backtest completo por combinação e pode levar vários
minutos, o que estoura o limite de execução de uma função serverless
(Vercel Hobby: ~60s). Por isso ele tem um workflow próprio, que roda direto
no runner do GitHub (sem HTTP, sem limite de tempo apertado).

**Configuração:**

1. Publique o repositório no Vercel (import do GitHub, zero-config pra
   Next.js). Configure lá as mesmas env vars do `.env` (`DATABASE_URL`,
   `NEXTAUTH_SECRET`, etc.) mais um `CRON_SECRET` novo (gere com
   `openssl rand -base64 32` — nunca reaproveite o do `.env.example`).
2. No GitHub, vá em **Settings → Secrets and variables → Actions** do
   repositório e crie:
   - `APP_URL` — a URL do seu deploy (ex: `https://seu-app.vercel.app`, sem
     barra no final)
   - `CRON_SECRET` — o mesmo valor que você colocou no Vercel
   - `DATABASE_URL` e (opcional) `TELEGRAM_BOT_TOKEN`/`SMTP_*` — pro
     workflow do stability-scan semanal, que roda fora do Vercel
3. Os dois workflows (`.github/workflows/scheduler-cycle.yml` e
   `weekly-stability-scan.yml`) já vêm prontos no repositório — assim que os
   secrets acima existirem, eles começam a rodar sozinhos no agendamento
   deles. Dá pra testar na hora pela aba **Actions → (nome do workflow) →
   Run workflow**, sem esperar o cron.

Com isso ativo, não precisa mais rodar `npm run scheduler` — o ciclo
acontece via GitHub Actions, e o painel de saúde no dashboard (heartbeat,
divergência, pausas) continua funcionando normal, porque lê do mesmo banco
independente de quem disparou o ciclo.

---

## Filtro de regime em produção (Pullback na EMA20)

A partir de 11/08/2026, a estratégia **Pullback na EMA20** só gera sinal ao
vivo quando o regime de mercado (ver aba Radar), naquele exato momento, está
em "Alta em Correção" ou "Baixa em Correção" — validado contra ETH, SOL e
ADA, melhorando ou mantendo o resultado nas 3. As outras 5 estratégias
continuam sem esse filtro (ainda não validadas o suficiente pra isso).

Isso é controlado por `REGIME_GATED_STRATEGIES_LIVE` em
`lib/analysis-engine.ts` — pra promover outra estratégia pra esse regime de
produção, primeiro valide via `Radar → Gatilho validado + filtro de regime`
(comparando "sozinho" vs "filtrado" em várias moedas) antes de adicionar o
ID dela nessa lista.

---

## Scanner em massa (testar todas as combinações de uma vez)

Em vez de rodar backtest um por um na tela, dá pra rodar TODAS as
combinações de estratégia × moeda × timeframe válido de uma vez, em
background:

```bash
npm run backtest:scan
```

Isso pode levar bastante tempo (são ~294 combinações, cada uma buscando
histórico real da Binance) — deixe rodando num terminal à parte. Os
resultados vão sendo salvos incrementalmente no banco, então:
- Dá pra acompanhar o progresso pelos logs do terminal.
- Se parar no meio (`Ctrl+C` ou queda de conexão), rodar de novo **pula** o
  que já foi calculado e continua de onde parou.
- Pra recalcular tudo do zero (ex: depois de mudar a lógica de uma
  estratégia), rode `npm run backtest:scan -- --force`.

Veja o relatório completo, ordenável e filtrável, na aba **Backtest** →
card "Relatório do Scan em Massa" no dashboard — clique em "Atualizar" pra
ver os resultados conforme o scan for enchendo a tabela. Ajuste o período de
cada backtest do scan via `SCAN_MONTHS` no `.env` (padrão: 3 meses).

---

## Estrutura

```
app/                   Rotas Next.js (App Router) + páginas do dashboard
lib/
  strategies.ts         As 6 estratégias de trading
  binance.ts             Cliente da API pública da Binance Futures (sem API key)
  analysis-engine.ts     Geração/gravação/notificação de sinais (usado pela rota manual e pelo agendador)
  stats-engine.ts         Fecha sinais reais e recalcula estatísticas
  mailer.ts / signal-email.ts   Envio de e-mail via SMTP
scripts/
  scheduler.ts            Agendador standalone (rode com `npm run scheduler`)
  seed.ts                  Seed idempotente (zera estatísticas, cria conta de teste)
prisma/schema.prisma      Modelo do banco (Postgres)
docker-compose.yml        Postgres + app + agendador com um comando
```

---

## Migrando dados antigos (se já rodou isso na Abacus)

Enquanto ainda tiver acesso ao banco antigo (`hosteddb.reai.io`), você pode
exportar os dados com `pg_dump` e restaurar no seu novo Postgres:

```bash
pg_dump "postgresql://usuario:senha@host-antigo:5432/banco" > backup.sql
psql "postgresql://robotrade:robotrade@localhost:5432/robotrade" < backup.sql
```

Depois de restaurar, rode uma vez o script de limpeza (marca os 3 sinais de
exemplo do seed antigo, que tinham resultado inventado, como demo — para não
poluir as estatísticas reais):

```bash
npx tsx --require dotenv/config scripts/migrate-legacy-demo-signals.ts
```

Se não tiver mais acesso ao banco antigo, sem problema — o app funciona
normalmente do zero, só que sem o histórico anterior (que de qualquer forma
tinha estatísticas fictícias).
