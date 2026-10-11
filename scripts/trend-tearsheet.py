"""Relatório quantstats da tendência diária (lib/trend-paper.ts), a partir dos CSVs de
scripts/export-trend-returns.ts. Python fora do projeto Node: rode num venv próprio.

    python -m venv .venv-trend && .venv-trend/Scripts/pip install quantstats
    npx tsx --require dotenv/config scripts/export-trend-returns.ts tmp-trend
    .venv-trend/Scripts/python scripts/trend-tearsheet.py tmp-trend

Gera <dir>/tearsheet_replay.html (backtest desde 2023, contra o BTC) e, se o livro-caixa
já tiver dias suficientes, <dir>/tearsheet_live.html. Imprime as métricas principais.
"""
import sys, pandas as pd, quantstats as qs

d = sys.argv[1] if len(sys.argv) > 1 else "tmp-trend"
qs.extend_pandas()

def load(name):
    x = pd.read_csv(f"{d}/{name}", parse_dates=["date"]).set_index("date")
    return x["equity"].pct_change().dropna().rename("Tendência diária"), x["btc_close"].pct_change().dropna().rename("BTC")

def summary(label, ret, bench):
    print(f"\n=== {label} ({ret.index[0].date()} → {ret.index[-1].date()}, {len(ret)} dias) ===")
    rows = [("CAGR", qs.stats.cagr(ret)), ("Volatilidade anual", qs.stats.volatility(ret)), ("Sharpe", qs.stats.sharpe(ret)), ("Sortino", qs.stats.sortino(ret)),
            ("Queda máxima", qs.stats.max_drawdown(ret)), ("Calmar", qs.stats.calmar(ret)), ("Pior dia", qs.stats.worst(ret)), ("Melhor dia", qs.stats.best(ret)),
            ("Dias positivos", qs.stats.win_rate(ret)), ("VaR 95% (dia)", qs.stats.value_at_risk(ret)), ("Exposição (dias ≠ 0)", qs.stats.exposure(ret))]
    brows = [("CAGR", qs.stats.cagr(bench)), ("Volatilidade anual", qs.stats.volatility(bench)), ("Sharpe", qs.stats.sharpe(bench)), ("Queda máxima", qs.stats.max_drawdown(bench))]
    print(f"  {'':22s}{'Tendência':>12s}{'BTC':>12s}")
    bd = dict(brows)
    for k, v in rows: print(f"  {k:22s}{v:>12.3f}{bd.get(k, float('nan')):>12.3f}")
    print(f"  correlação diária com o BTC: {ret.corr(bench):.2f}")

ret, bench = load("trend_replay.csv")
summary("REPLAY (backtest da regra fixa)", ret, bench)
qs.reports.html(ret, benchmark=bench, output=f"{d}/tearsheet_replay.html", title="Tendência diária — replay desde 2023 (backtest)", periods_per_year=365)
try:
    lret, lbench = load("trend_live.csv")
    if len(lret) >= 5:
        summary("LIVE (teste à frente)", lret, lbench)
        qs.reports.html(lret, benchmark=lbench, output=f"{d}/tearsheet_live.html", title="Tendência diária — teste à frente", periods_per_year=365)
except FileNotFoundError:
    pass
print(f"\nHTML gerado em {d}/")
