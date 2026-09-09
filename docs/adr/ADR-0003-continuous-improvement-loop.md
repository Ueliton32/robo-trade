# ADR-0003 — Continuous improvement loop from monitoring reports

## Status

Accepted for implementation as read-only hypothesis management.

## Context

Daily, weekly, monthly and update monitoring reports should not only store results. They should also surface improvement hypotheses when there is persistent failure, degradation, drift or a relevant technical opportunity.

The trading system must not let monitors mutate strategy behavior. Hypotheses are observations and experiment proposals, not implementation approval.

## Decision

Add a continuous-improvement layer under `lib/monitoring/` that derives hypotheses from monitoring results and stores them in a versioned backlog.

Allowed automatic actions:

- analyze monitoring reports;
- compare metrics;
- detect patterns;
- formulate hypotheses;
- update the experiment backlog;
- render documentation/report sections.

Forbidden automatic actions:

- alter strategy code or operational logic;
- modify parameters, thresholds, factors, weights, configs or environment;
- recalibrate anything;
- create experiment branches;
- commit, merge, release or deploy;
- activate paper/live trading;
- place orders.

## Backlog

The backlog is versioned in:

- `reports/monitoring/improvement-backlog.json`
- `reports/monitoring/improvement-backlog.md`

New automatically derived hypotheses start only as `OBSERVED`. Transitions to experiment or implementation states require explicit user approval.

## Experiment rule

When a hypothesis is explicitly approved, run one isolated experiment on a branch, register baseline before changing code, preserve train/validation/test separation, check look-ahead/data leakage, run automated tests, include fees/slippage/funding, perform walk-forward analysis and compare against the current version. No merge/deploy/paper trading happens without user decision.

## Consequences

Monitoring reports gain a section named `Hipóteses de melhoria contínua`. If evidence is insufficient, they must state exactly: `Nenhuma hipótese de melhoria estatisticamente sustentada neste período.`
