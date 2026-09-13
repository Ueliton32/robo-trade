# ADR-0001 — Strategy Eligibility audit layer

## Status

Accepted — implemented as audit-only first.

## Context

The project has signal generation, enrichment, circuit breakers, strategy weights, ML probability, regime filters, shadow evaluation, and a paper/live dashboard. A future operational strategy/execution path needs a deterministic gate before any trading action can be considered.

The gate must not become another strategy or execution engine. It must consume existing contracts/results and produce an auditable decision for LONG and SHORT independently.

## Decision

Add `Strategy Eligibility` as a pure domain module:

- `lib/strategy-eligibility-config.ts` owns immutable versioned config and SHA-256 fingerprinting.
- `lib/strategy-eligibility.ts` evaluates a single signal and returns decision, reason codes, and audit metadata.
- `lib/analysis-engine.ts` attaches audit results after enriched cycle candidates are generated.
- Results are persisted in the existing `Signal.indicators.strategyEligibility` JSON field.

This version is audit-only. It never blocks generated signals.

## Constraints preserved

- No changes to BacktestEngine.
- No Prisma/Binance access inside the domain evaluator.
- No entry/stop/target/leverage/position/order calculations.
- Existing API/dashboard source filters remain untouched.
- Existing ports/adapters are preserved; integration is incremental in `analysis-engine.ts`.

## Consequences

- Live and shadow records can accumulate eligibility decisions for later comparison.
- Threshold changes are traceable through config version and fingerprint.
- The next version may turn `INELIGIBLE` into an actual blocking gate, but only after reviewing collected audit data.
