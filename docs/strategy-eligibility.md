# Strategy Eligibility

Strategy Eligibility is a deterministic audit layer between enriched signal generation and any future operational strategy/execution path.

## Scope

The evaluator only returns `ELIGIBLE` or `INELIGIBLE` with reason codes. It does not calculate entry, stop, targets, leverage, position size, orders, or exchange operations.

## Domain contract

Main API:

```ts
evaluateStrategyEligibility(input: StrategyEligibilityInput): StrategyEligibilityResult
```

Input uses existing signal/enrichment fields:

- `strategyId`, `strategyName`, `pair`, `timeframe`, `direction`
- `confidence`
- `marketRegime`, `regimeForce`, `atrRatio`, `volumeRatio`, `spreadAtSignal`
- `mlProbability`, `mlModelVersion`, `weightAtSignal`
- same-cycle candidates for LONG/SHORT conflict checks

The evaluator is pure: no Prisma, no Binance, no `.env`, no clock-dependent logic except `audit.evaluatedAt`.

## Checks

- confidence: raw strategy confidence and optional composite/ML probability
- coverage: required market regime, ATR ratio, volume ratio, optional ML probability
- conflicts: opposite direction in same `pair + timeframe`, with confidence-gap override
- volatility: ATR expansion and high-volatility/no-direction regime
- liquidity: minimum volume ratio and maximum spread percent

## Audit output

Every result includes:

- `decision`
- `eligible`
- `direction`
- stable reason codes
- config version
- SHA-256 config fingerprint
- per-check pass/fail booleans

## Current integration

The first version is audit-only. `lib/analysis-engine.ts` evaluates generated enriched signals after the cycle candidate set is known, stores the result on the signal object, and persists it under `Signal.indicators.strategyEligibility` for both live and shadow records.

It does not block signal generation. Blocking requires a later explicit product decision after enough live/shadow evidence.
