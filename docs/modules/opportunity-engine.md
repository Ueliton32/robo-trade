# Opportunity Engine

## Visão geral

O Opportunity Engine é o módulo FASE 3 do LP Portfolio Monitor. Ele consolida snapshots de pools descobertas pelo Pool Scanner, calcula métricas de oportunidade e armazena scores.

READ ONLY. Não executa transações.

## Arquitetura em camadas

Presentation
  ↓
Application
  ↓
Domain
  ↓
Market Intelligence / Portfolio Intelligence
  ↓
Adapters
  ↓
Providers
  ↓
External Sources

## Módulos

lib/monitoring/lp/opportunity-engine/
- storage.ts — SQLite, snapshots imutáveis
- scorer.ts — liquidez, fee, risco, capital efficiency
- opportunity-engine.ts — orquestração
- run.ts — CLI
- test.ts — valida scores 0–100

## Métricas

- liquidity_score: log10(liquidity) * 10, capped 100
- fee_score: APR estimado via volume*fee/tvl, capped 100
- risk_score: 100 - f(turnover), capped 0–100
- capital_efficiency_score: eficiência de capital, capped 0–100
- opportunity_score: média ponderada (30/30/20/20)

## Fontes

- Pool Scanner snapshots (DERIVED)
- Revert (DIRECT_INDEXER) via Pool Scanner

## Validação

- Scores em 0–100
- Pool duplicada única por network + pool_address
- Snapshots imutáveis
- Provenance registrada
- Read-only, sem transações

## Estado

FASE 3 implementada, validada e congelada.

## Integração

Execução:
npx tsx lib/monitoring/lp/opportunity-engine/run.ts

Entrada: Pool Scanner storage
Saída: opportunity.db com scores ranqueados
