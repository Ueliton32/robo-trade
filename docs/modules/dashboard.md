# LP Intelligence Dashboard - Documentation

## Arquitetura

A camada Presentation consome exclusivamente os módulos existentes sem recálculo ou alteração de lógica:

- **Portfolio Monitor** → `lib/monitoring/lp/v13/snapshots.db`
- **Pool Scanner** → `lib/monitoring/lp/pool-scanner/pools.db`
- **Opportunity Engine** → `lib/monitoring/lp/opportunity-engine/opportunity.db`
- **Cross Market Intelligence** → `lib/monitoring/lp/cross-market-intelligence/cross-market.db`
- **Decision Engine** → `lib/monitoring/lp/decision-engine/decision.db`

## Fluxo de Dados

1. Dashboard inicializa carregando último Decision Report
2. Decision Engine consolida dados dos 4 módulos
3. Componentes renderizam dados sem transformação
4. Refresh manual força recálculo no backend

## Componentes

### Reutilizáveis
- `MetricCard` - Card de métrica com ícone e variação
- `RegimeBadge` - Badge colorida para regimes (GREEN/YELLOW/RED)
- `DecisionCard` - Card completo de Decision Report

### Páginas
- `/lp` - Dashboard principal
- `/lp/portfolio` - Histórico do portfolio
- `/lp/pools` - Ranking de pools
- `/lp/market` - Regimes de mercado
- `/lp/decision` - Decision Report completo
- `/lp/snapshots` - Histórico de snapshots
- `/lp/settings` - Health check do sistema

## Dependências

- Next.js 14 (App Router)
- React 18
- TypeScript
- TailwindCSS
- shadcn/ui
- Recharts (gráficos)
- Lucide Icons
- better-sqlite3 (leitura apenas)

## Origem dos Dados

Todos os dados são lidos diretamente dos SQLites dos módulos Core. Nenhum cálculo é feito na camada Presentation.

- Valores financeiros: origem Portfolio Monitor / Snapshot Engine
- Scores: origem Opportunity Engine (calculado previamente)
- Regimes: origem Cross Market Intelligence (calculado previamente)
- Decisão: origem Decision Engine (consolidado previamente)

## READ ONLY

A camada Dashboard é 100% READ ONLY:
- Nenhum botão de transação
- Nenhuma ação financeira
- Apenas visualização e refresh manual
- Nenhuma modificação de dados
- Nenhum cálculo adicional

## Performance

- Server Components por padrão
- Client Components apenas para interatividade (refresh, gráficos)
- Lazy loading de dados
- Sem polling automático
- Cache de 60s para relatórios

## Decision First

A Home prioriza Ação do Dia, posição, alertas, oportunidade disponível e leitura humana dos regimes. A navegação lateral separa Portfolio, Opportunities, Market, Decision, Snapshots, Analytics e Settings. A interface permanece READ ONLY e não inventa oportunidades quando o snapshot fornece somente a pool atual.
