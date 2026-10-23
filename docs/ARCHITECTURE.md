# ARCHITECTURE.md — LP Portfolio Monitor

## 1. Visão Geral

**Nome oficial:** LP Portfolio Monitor

**Objetivo:** Monitorar posições de liquidez Uniswap V3 em modo 100% READ-ONLY, com auto-discovery a partir de `position_id`, persistência de série temporal via SQLite e validação cruzada RPC vs Revert.

**Escopo:** 
- Descoberta automática de posição V3 a partir de `chain + position_id`
- Coleta idempotente de snapshots a cada hora
- Cálculo de métricas V1.2.1 congeladas: Current Value, HODL Value, LP Total Value, LP Net PnL, LP Alpha, Divergence
- Health checks de freshness, RPC indisponível, divergência identidade, preço ausente

**Não objetivos:**
- Executar transações, swaps, mint/burn, collect, approve, Permit2
- Alertas, Pool Scanner, Opportunity Engine, rebalanceamento

**Roadmap resumido:**
FASE 1 Portfolio Monitor — DONE
FASE 2 Snapshot & Time-Series — DONE V1.3
FASE 3 Read-Only Collector V1.4 — DONE
FASE 4 Scheduler — CONFIGURED
FASE 5 Pool Scanner / Opportunity — PLANNED

## 2. Filosofia do Projeto

- READ ONLY por padrão
- Nunca executar transações automaticamente
- Provenance obrigatório em todo campo
- Nunca inventar preços
- Nunca substituir dados ausentes por zero; diferenciar NULL/STALE/UNAVAILABLE/zero real
- RPC é Source of Truth do estado atual
- Revert é Direct Indexer
- CoinGecko é Source of Truth de preço
- Cross Validation sempre que possível
- Todo cálculo deve ser reproduzível

## 3. Arquitetura Geral

Wallet
  ↓
Revert DIRECT_INDEXER
  ↓
RPC DIRECT_ONCHAIN
  ↓
Validation Engine
  ↓
V1.2.1 Performance Engine
  ↓
V1.3 Snapshot Engine
  ↓
V1.4 Collector
  ↓
SQLite Time-Series

## 4. Fontes de Dados

| Fonte | Objetivo | Provenance | Status |
|-------|----------|------------|--------|
| RPC | ownerOf, positions, slot0, pool factory | DIRECT_ONCHAIN | ACTIVE |
| Revert MCP | analytics, fees, baseline, HODL benchmark | DIRECT_INDEXER | ACTIVE |
| CoinGecko via AIsa | preços de token | DIRECT_PRICE | ACTIVE |
| GeckoTerminal | descoberta de pool, TVL, volume | DERIVED | PLANNED |
| The Graph | histórico/backfill | DIRECT_INDEXER | PLANNED |

## 5. Provenance

- DIRECT_ONCHAIN: leitura on-chain via RPC
- DIRECT_INDEXER: Revert indexed data
- DIRECT_PRICE: CoinGecko
- DERIVED: cálculo interno a partir de fontes primárias
- ESTIMATED: fallback com confiança reduzida
- UNKNOWN: origem não identificada

## 6. Estrutura dos Módulos

**Portfolio Monitor**
- Objetivo: orquestrar coleta e validação
- Entradas: chain, position_id, wallet, RPC_URL
- Saídas: snapshot
- Estado: DONE

**Snapshot Engine V1.3**
- Objetivo: persistir snapshots idempotentes SQLite
- Entradas: meta, data
- Saídas: boolean inserted
- Estado: DONE

**Collector V1.4**
- Objetivo: pipeline Revert → RPC → Engine → Snapshot
- Estado: DONE

**Adapters**
- revert-adapter.ts, rpc-adapter.ts, auto-discovery.ts
- Estado: DONE

**Validation Engine**
- Comparação RPC × Revert, health checks
- Estado: ACTIVE

## 7. Métricas Oficiais V1.2.1

- Current Position Value
- HODL Value
- LP Total Value = Current Position Value + Total Fees
- LP Net PnL = LP Total Value - Initial Capital
- LP Alpha USD = LP Total Value - HODL Value
- LP Alpha % = (LP Total Value / HODL Value -1)*100
- Divergence PnL = Current Position Value - HODL Value
- Divergence % = Divergence PnL / HODL Value *100
- Total Fees = Collected + Uncollected
- Time In Range, Fee Velocity — derivadas de série temporal

## 8. Fluxo Completo

Wallet → Revert get_positions → get_position_details → get_pool_state
→ RPC autoDiscover + slot0
→ Validation cross-check
→ Performance Engine V1.2.1
→ Snapshot Engine V1.3 captureSnapshot
→ Collector log

## 9. Estrutura de Diretórios

lib/monitoring/lp/
  adapters.ts
  auto-discovery.ts
  revert-adapter.ts
  rpc-adapter.ts
  v12/engine.ts
  v13/snapshot-engine.ts
  v14/collector.ts
  v14/status.ts
  v14/scheduler.ts

## 10. ADR

ADR-001 RPC é Source of Truth — Accepted
ADR-002 Revert é Direct Indexer — Accepted
ADR-003 READ ONLY Architecture — Accepted
ADR-004 LP Alpha calculado internamente — Accepted
ADR-005 Provenance obrigatório — Accepted

## 11. Roadmap

FASE 1 Portfolio Monitor — DONE
FASE 2 Snapshot — DONE
FASE 3 Collector V1.4 — DONE
FASE 4 Scheduler 1/h — CONFIGURED
FASE 5 Pool Scanner — PLANNED

## 12. Regras de Evolução

Atualizar este documento ao criar módulo, mudar fonte, alterar fórmula ou ADR.
Nunca remover decisões antigas; marcar Accepted/Deprecated/Superseded/Rejected.


## 13. Arquitetura em Camadas

Presentation
  ↓
Application
  ↓
Domain
  ↓
Market Intelligence
  Portfolio Intelligence
  ↓
Adapters
  ↓
Providers
  ↓
External Sources
