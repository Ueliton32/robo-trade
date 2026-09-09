# Technical Monitoring

Automated technical monitoring is read-only for trading data. It writes reports only under `reports/monitoring/` and must not repair data, restart services, change thresholds, deploy, merge, or send exchange orders.

## Routines

- Daily: `npm run monitoring:daily` — Binance data availability, candle delay, gaps, duplicates, invalid OHLCV, DB integrity, local report/log growth.
- Update validation: `npm run validate:update` — tests, typecheck, lint, Prisma schema validation, npm audit, build, and baseline comparison.
- Weekly: `npm run monitoring:weekly` — signal distribution, confidence/coverage, Strategy Eligibility reason codes, live/shadow stability and performance metrics.
- Monthly: `npm run monitoring:monthly` — experimental PSI drift, regimes from persisted `marketRegime`, costs read from existing persisted fields.
- Incident summary: `npm run monitoring:incident` — deterministic incident report and Telegram notification via `notifyOps` when CRITICAL.

## Reports

Each run writes Markdown, JSON and log files under:

```text
reports/monitoring/daily/
reports/monitoring/weekly/
reports/monitoring/monthly/
reports/monitoring/regressions/
reports/monitoring/incidents/
reports/monitoring/baselines/
reports/monitoring/logs/
reports/monitoring/locks/
```

Exit codes: `0` for OK/WARNING, non-zero for CRITICAL or monitor execution failure.

## Continuous improvement

Weekly, monthly and update reports include `Hipóteses de melhoria contínua`. The monitoring layer may derive hypotheses and update `reports/monitoring/improvement-backlog.json`, but every hypothesis starts as `OBSERVED` and cannot automatically change code, strategy, factors, weights, thresholds, config, environment, branches, commits, merge, deploy, paper trading or orders.

If evidence is insufficient, reports must say: `Nenhuma hipótese de melhoria estatisticamente sustentada neste período.`

Use:

```bash
npm run improvement:backlog
```

to validate and render the backlog. Approved experiments require an explicit user message naming the hypothesis id, a dedicated branch, a pre-change baseline, one principal hypothesis only, automated tests, backtest with fees/slippage/funding, walk-forward analysis, out-of-sample validation and user decision before merge/deploy.

## Alerting

CRITICAL checks call `notifyOps`, which uses Telegram subscribers already configured in `UserSettings` and `TELEGRAM_BOT_TOKEN`. Duplicate alerts are suppressed by incident fingerprint for 180 minutes. If Telegram is unavailable, a local incident notification file is written.

## Safety

The monitors do not update `Signal`, do not alter strategies, do not recalculate weights, do not change thresholds, do not call exchange order APIs, and do not deploy. Fees/slippage remain owned by the existing backtest/close-out cost modules; monthly monitoring reads the persisted fields only.

## Statistical limits

Monthly drift uses Population Stability Index with experimental thresholds: warning at `0.10`, critical at `0.25`. These thresholds are explicitly not validated for trading decisions yet.
