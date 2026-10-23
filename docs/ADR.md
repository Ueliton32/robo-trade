# ADR.md

## ADR-001 RPC é Source of Truth
Título: RPC é Source of Truth do estado atual
Contexto: Necessidade de validação on-chain independente
Problema: Revert pode ter delay
Alternativas: Confiar apenas em Revert
Decisão: RPC prevalece em conflito para estado atual
Consequências: Latência RPC aceita
Status: Accepted
Data: 2026-10-07

## ADR-002 Revert é Direct Indexer
Título: Revert como fonte de analytics e baseline
Contexto: Necessidade de histórico e fees
Problema: Reconstruir on-chain é custoso
Alternativas: Indexer próprio
Decisão: Revert como DIRECT_INDEXER
Consequências: Dependência de freshness
Status: Accepted
Data: 2026-10-07

## ADR-003 READ ONLY Architecture
Título: Sistema opera em modo READ ONLY
Contexto: Segurança e compliance
Problema: Evitar execução acidental
Alternativas: Modo híbrido
Decisão: Proibir approve/swap/mint/burn/collect
Consequências: Limita escopo a monitoramento
Status: Accepted
Data: 2026-10-07

## ADR-004 LP Alpha calculado internamente
Título: Cálculo de LP Alpha interno
Contexto: Semântica Revert não resolvida
Problema: Métricas Revert divergem
Alternativas: Copiar métricas Revert
Decisão: Calcular independentemente V1.2.1
Consequências: Manutenção de fórmulas
Status: Accepted
Data: 2026-10-07

## ADR-005 Provenance obrigatório
Título: Provenance em todo campo
Contexto: Rastreabilidade
Problema: Origem de dados ambígua
Alternativas: Logs simples
Decisão: Provenance em toda estrutura
Consequências: Overhead de tipagem
Status: Accepted
Data: 2026-10-07
