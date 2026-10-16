# Cross Market Intelligence

## Visão geral

O Cross Market Intelligence é o módulo FASE 4 do LP Portfolio Monitor. Ele identifica o regime atual dos mercados produzindo cinco objetos independentes: MacroRegime, MarketRegime, CryptoRegime, TokenizationRegime e LiquidityRegime.

Cada objeto contém:
- state
- confidence (0–100)
- fatores utilizados
- timestamp
- provenance

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

lib/monitoring/lp/cross-market-intelligence/
- storage.ts — SQLite, snapshots imutáveis
- data-fetcher.ts — wrapper para fetch com tratamento de erros
- macro.ts — Regime macroeconômico (FRED)
- market.ts — Regime de mercado (Finnhub)
- crypto.ts — Regime de cripto (CoinGecko + Alternative.me)
- tokenization.ts — Regime de tokenização (RWA.xyz)
- liquidity.ts — Regime de liquidez (Pool Scanner agregado)
- cross-market-intelligence.ts — orquestração
- run.ts — CLI
- test.ts — validações de fatores e determinismo

## Regimes

### MacroRegime
- Fed Funds (FEDFUNDS)
- CPI (CPIAUCSL)
- PCE (PCEPI)
- GDP (GDP)
- Unemployment (UNRATE)
- Payrolls (PAYEMS)
- Treasury yields (DGS2, DGS5, DGS10, DGS30)
- Yield curve (10y-2y)

### MarketRegime
- S&P 500 (SPY)
- Nasdaq (QQQ)
- Dow (DJIA)
- VIX (^VIX)
- Dollar Index (UUP, aproximado)
- Russell 2000 (IWM)

### CryptoRegime
- BTC price (CoinGecko)
- ETH price (CoinGecko)
- Market cap (CoinGecko global)
- BTC dominância (CoinGecko global)
- ETH dominância (CoinGecko global)
- Fear & Greed (Alternative.me, opcional)

### TokenizationRegime
- Market value (RWA.xyz)
- Holders (RWA.xyz)
- Supply (RWA.xyz)
- Transfer volume 24h (RWA.xyz)
- Premium/Discount (RWA.xyz)

### LiquidityRegime
- TVL agregado (Pool Scanner)
- Volume 24h agregado (Pool Scanner)
- Volume 7d agregado (Pool Scanner)
- Volume 30d agregado (Pool Scanner)
- Turnover 24h (volume/tvl)
- Contagem de pools

## Fontes

- FRED (macro)
- Finnhub (market)
- CoinGecko (crypto)
- Alternative.me (Fear & Greed, opcional)
- RWA.xyz (tokenization)
- Pool Scanner (liquidity) — DERIVED

## Validação

- Cada regime produz estado e confiança 0–100
- Sem scores agregados nesta fase
- Snapshots imutáveis no SQLite
- Provenance registrada
- Read-only, sem transações
- Determinismo testado (mesmos inputs → mesmos outputs)
- Tratamento de fontes indisponíveis (confiança 0, fatores vazios)

## Estado

FASE 4 implementada, validada e congelada.

## Integração

Execução:
npx tsx lib/monitoring/lp/cross-market-intelligence/run.ts

Entrada: nenhum (usa fontes externas)
Saída: cross-market.db com regime_snapshots
