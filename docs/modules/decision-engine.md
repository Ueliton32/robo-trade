# Decision Engine

## Visão geral

FASE 5 — Integração determinística dos módulos existentes.

O Decision Engine NÃO produz novos dados, NÃO recalcula métricas, NÃO modifica scores, NÃO consulta APIs externas e NÃO executa transações.

Sua única função é consolidar Portfolio Monitor, Pool Scanner, Opportunity Engine e Cross Market Intelligence em um Decision Report determinístico e explicável.

## Arquitetura

lib/monitoring/lp/decision-engine/
- storage.ts — SQLite isolado, snapshots imutáveis
- rule-engine.ts — regras determinísticas, PASS/FAIL/NOT_APPLICABLE
- decision-engine.ts — orquestração e construção do Decision Report
- run.ts — CLI
- test.ts — determinismo, explicabilidade, persistência, read-only

## Decision Report

Estrutura:
- timestamp
- portfolio: current_position, current_pool, portfolio_health, portfolio_rank, portfolio_percentile, portfolio_value, portfolio_pnl, lp_alpha, fees
- market_context: macro_regime, market_regime, crypto_regime, tokenization_regime, liquidity_regime
- opportunity: opportunity_score, liquidity_score, fee_score, risk_score, capital_efficiency, ranking_position, ranking_percentile
- risk: overall_risk, primary_risks, confidence
- status: status, status_reason, watch_items
- provenance: timestamp, sources, freshness
- explainability: triggered_rules, metrics_used, modules_used

Estados permitidos: HEALTHY, WATCH, REVIEW, STRONG_CANDIDATE, ROTATE_CANDIDATE, UNHEALTHY

## Rule Engine

Regras implementadas:
- R001 Portfolio alpha positive → HEALTHY
- R002 Portfolio alpha negative severe → UNHEALTHY
- R003 Opportunity score high → STRONG_CANDIDATE
- R004 Opportunity score low → ROTATE_CANDIDATE
- R005 In range check → WATCH
- R006 Risk score high → REVIEW
- R007 Macro regime bearish → WATCH
- R008 Liquidity regime low → WATCH
- R009 Crypto regime extreme fear → REVIEW

Cada regra: id, name, description, priority, condition, result
Avaliação: PASS / FAIL / NOT_APPLICABLE
Consolidação por prioridade.

## Explicabilidade

Toda decisão informa:
- qual regra disparou
- quais métricas participaram
- quais módulos forneceram os dados

Nenhuma decisão é caixa preta.

## Storage

SQLite isolado: decision.db
Tabela: decision_snapshots (ts, report_json, status, triggered_rules, provenance_json)
Snapshots imutáveis, histórico completo.

## Validação

- Determinismo confirmado
- Explicabilidade completa
- Persistência OK
- Consistência OK
- READ ONLY confirmado
- Regras conflitantes resolvidas por prioridade
- Ausência de dados: confiança 0, status NEUTRAL

## Entradas consumidas

- Portfolio Monitor (v13 snapshots)
- Pool Scanner (pools.db)
- Opportunity Engine (opportunity.db)
- Cross Market Intelligence (cross-market.db)

Nenhum outro módulo.

## Restrições

Sem IA, sem JEV, sem LLM, sem novas APIs, sem novos scores, sem modificação de módulos existentes, sem transações.

## Estado

FASE 5 implementada, validada e congelada.
