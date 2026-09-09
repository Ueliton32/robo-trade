# ADR-0002 — Technical monitoring automation

## Status

Accepted.

## Context

Manual audits are slow and miss regressions. The trading bot already has deterministic modules for data access, metrics, backtest costs, signal enrichment, Strategy Eligibility audit, scheduler health, and Prisma persistence.

## Decision

Add read-only technical monitoring routines:

- daily data quality and freshness;
- update-time validation/regression command and CI workflow;
- weekly metric stability and eligibility reason-code review;
- monthly drift/regime/cost review;
- CRITICAL incident reporting with deduplicated Telegram notifications.

Reports are written as Markdown, JSON and logs under `reports/monitoring/`. All routines use locks to prevent overlapping runs.

## Constraints

- No automatic data repair.
- No service restart.
- No strategy/weight/threshold changes.
- No order placement.
- No deploy/merge/rollback.
- No secret disclosure.
- Fees/slippage are not recalculated outside existing cost/backtest/close-out responsibility.

## Consequences

The project gains repeatable audit artifacts and baseline comparisons. Some thresholds, especially drift PSI, are experimental until enough history validates them. Warnings are evidence for manual review, not authorization for live trading.
