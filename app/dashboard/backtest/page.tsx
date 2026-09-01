'use client';
import { useState, useCallback, useMemo, useEffect } from 'react';
import { FlaskConical, Play, Info, TrendingUp, TrendingDown, ListChecks, RefreshCw, ArrowUpDown, Download, AlertTriangle, GitCompare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { formatPrice } from '@/lib/utils';

const STRATEGIES = [
  { id: 1, name: 'Rompimento de Range', timeframes: ['15m', '1h', '4h'] },
  { id: 2, name: 'Pullback na EMA20', timeframes: ['1h', '4h'] },
  { id: 3, name: 'Trap de Liquidez', timeframes: ['5m', '15m', '1h'] },
  { id: 4, name: 'Funding Extremo', timeframes: ['1h'] },
  { id: 5, name: 'Reversão após Liquidação', timeframes: ['5m', '15m'] },
  { id: 6, name: 'Compressão de Volatilidade', timeframes: ['1h', '4h', '1d'] },
];

const PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'SUIUSDT', 'AVAXUSDT', 'LINKUSDT', 'LTCUSDT', 'TRXUSDT', 'XLMUSDT', 'UNIUSDT', 'DOTUSDT', 'BCHUSDT', 'DOGEUSDT', '1000PEPEUSDT', 'ZECUSDT', 'HYPEUSDT', 'WLDUSDT', 'TAOUSDT'];
const PERIODS = [
  { value: '1', label: 'Último mês' },
  { value: '3', label: 'Últimos 3 meses' },
  { value: '6', label: 'Últimos 6 meses' },
  { value: '12', label: 'Último ano' },
];

export default function BacktestPage() {
  const [strategyId, setStrategyId] = useState<number>(1);
  const [pair, setPair] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [months, setMonths] = useState('3');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const [scanResults, setScanResults] = useState<any[]>([]);
  const [loadingScan, setLoadingScan] = useState(false);
  const [minTrades, setMinTrades] = useState(15);
  const [sortField, setSortField] = useState<'profitFactor' | 'expectancy' | 'winRate' | 'totalTrades'>('profitFactor');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [comparisons, setComparisons] = useState<any[]>([]);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [comparisonDays, setComparisonDays] = useState('7');

  const [togglingCombo, setTogglingCombo] = useState<string | null>(null);

  const toggleComboPause = useCallback(async (c: any) => {
    const key = `${c.strategyId}|${c.pair}|${c.timeframe}`;
    setTogglingCombo(key);
    try {
      const res = await fetch(`/api/backtest/${c.paused ? 'resume-combo' : 'pause-combo'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: c.strategyId, pair: c.pair, timeframe: c.timeframe }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success(c.paused ? 'Combinação reativada' : 'Combinação pausada — para de gerar sinal novo ao vivo');
        setComparisons((prev) => prev.map((p) => (p.strategyId === c.strategyId && p.pair === c.pair && p.timeframe === c.timeframe ? { ...p, paused: !c.paused } : p)));
      } else {
        toast.error(json?.error ?? 'Erro ao atualizar combinação');
      }
    } catch {
      toast.error('Erro ao atualizar combinação');
    } finally {
      setTogglingCombo(null);
    }
  }, []);

  const [stabilityResults, setStabilityResults] = useState<any[]>([]);
  const [loadingStability, setLoadingStability] = useState(false);
  const [stabilityLastRun, setStabilityLastRun] = useState<string | null>(null);

  const loadStability = useCallback(async () => {
    setLoadingStability(true);
    try {
      const res = await fetch('/api/backtest/stability');
      const json = await res.json();
      if (res.ok) {
        setStabilityResults(json?.results ?? []);
        setStabilityLastRun(json?.lastRunAt ?? null);
      } else {
        toast.error(json?.error ?? 'Erro ao buscar estabilidade');
      }
    } catch {
      toast.error('Erro ao buscar estabilidade');
    } finally {
      setLoadingStability(false);
    }
  }, []);

  useEffect(() => {
    loadStability();
  }, [loadStability]);

  const loadComparisons = useCallback(async () => {
    setLoadingComparison(true);
    try {
      const res = await fetch(`/api/backtest/live-comparison?days=${comparisonDays}`);
      const json = await res.json();
      if (res.ok) {
        setComparisons(json?.comparisons ?? []);
      } else {
        toast.error(json?.error ?? 'Erro ao comparar');
      }
    } catch {
      toast.error('Erro ao comparar');
    } finally {
      setLoadingComparison(false);
    }
  }, [comparisonDays]);

  useEffect(() => { loadComparisons(); }, [loadComparisons]);

  const loadScanResults = useCallback(async () => {
    setLoadingScan(true);
    try {
      const res = await fetch('/api/backtest/scan-results');
      const json = await res.json();
      if (res.ok) {
        setScanResults(json?.results ?? []);
      } else {
        toast.error(json?.error ?? 'Erro ao carregar relatório');
      }
    } catch {
      toast.error('Erro ao carregar relatório');
    } finally {
      setLoadingScan(false);
    }
  }, []);

  useEffect(() => { loadScanResults(); }, [loadScanResults]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const filteredScanResults = useMemo(() => {
    const filtered = scanResults.filter((r) => (r?.totalTrades ?? 0) >= minTrades);
    return [...filtered].sort((a, b) => {
      const diff = (a?.[sortField] ?? 0) - (b?.[sortField] ?? 0);
      return sortDir === 'desc' ? -diff : diff;
    });
  }, [scanResults, minTrades, sortField, sortDir]);

  const currentStrategy = useMemo(() => STRATEGIES.find((s) => s.id === strategyId)!, [strategyId]);
  const isFunding = strategyId === 4;

  const handleStrategyChange = (val: string) => {
    const id = Number(val);
    setStrategyId(id);
    const strat = STRATEGIES.find((s) => s.id === id)!;
    if (!strat.timeframes.includes(timeframe)) setTimeframe(strat.timeframes[0]);
  };

  const runBacktest = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId, pair, timeframe, months: Number(months) }),
      });
      const json = await res.json();
      if (res.ok) {
        setResult(json);
        if ((json?.metrics?.totalTrades ?? 0) === 0) {
          toast.info('Nenhum trade simulado nesse período — a estratégia não encontrou nenhuma condição de entrada. Tente um período maior.');
        } else {
          toast.success(`Backtest concluído: ${json.metrics.totalTrades} trade(s) simulado(s).`);
        }
      } else {
        toast.error(json?.error ?? 'Erro ao rodar backtest');
      }
    } catch (e: any) {
      toast.error('Erro ao rodar backtest. Pode ter demorado demais (períodos longos em timeframes curtos levam mais tempo) — tente um período menor.');
    } finally {
      setRunning(false);
    }
  }, [strategyId, pair, timeframe, months]);

  const m = result?.metrics;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-primary" /> Backtest
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Teste uma estratégia contra o histórico real da Binance, sem esperar o robô acumular trades ao vivo</p>
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-card/50 border border-border/50 rounded-lg p-3">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
        <p>
          Isso roda a MESMA lógica de decisão do robô ao vivo contra candles históricos reais da Binance —
          não é uma simulação aproximada. Os resultados já descontam ~0,1% de taxas/slippage por operação
          pra não ficar otimista demais. Ainda assim: <strong>desempenho passado não garante desempenho futuro</strong> —
          use isto pra comparar variações e formar hipóteses, não como previsão.
        </p>
      </div>

      {/* Comparação Backtest vs Ao Vivo */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-display flex items-center gap-2"><GitCompare className="w-4 h-4" /> Backtest vs Ao Vivo</CardTitle>
              <CardDescription>Compara o que o backtest previu com o que está acontecendo de verdade, combinação por combinação</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={comparisonDays} onValueChange={setComparisonDays}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Últimas 24h</SelectItem>
                  <SelectItem value="3">Últimos 3 dias</SelectItem>
                  <SelectItem value="7">Últimos 7 dias</SelectItem>
                  <SelectItem value="14">Últimos 14 dias</SelectItem>
                  <SelectItem value="30">Últimos 30 dias</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={loadComparisons} disabled={loadingComparison}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingComparison ? 'animate-spin' : ''}`} /> Atualizar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {comparisons.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
              Nenhuma combinação configurada em Configurações → Estratégia por Moeda ainda, ou nenhum backtest
              rodado pra elas (rode <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">npm run backtest:scan</code>).
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Moeda</TableHead>
                      <TableHead>Estratégia</TableHead>
                      <TableHead>TF</TableHead>
                      <TableHead className="text-right">PF Backtest</TableHead>
                      <TableHead className="text-right">PF Ao Vivo</TableHead>
                      <TableHead className="text-right">Trades Ao Vivo</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisons.map((c: any, i: number) => {
                      const comboKey = `${c.strategyId}|${c.pair}|${c.timeframe}`;
                      return (
                      <TableRow key={i} className={c.paused ? 'opacity-50' : c.divergent ? 'bg-red-500/5' : ''}>
                        <TableCell className="font-mono text-xs">{c.pair.replace('USDT', '/USDT')}</TableCell>
                        <TableCell className="text-xs">{c.strategyName}</TableCell>
                        <TableCell className="text-xs">{c.timeframe}</TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {c.backtest ? c.backtest.profitFactor.toFixed(2) : '—'}
                          {!c.backtest && <Badge variant="outline" className="ml-1 text-[9px] border-yellow-500/40 text-yellow-400">sem baseline</Badge>}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-xs ${!c.hasEnoughLiveData ? 'text-muted-foreground' : c.live.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {c.live.totalTrades > 0 ? c.live.profitFactor.toFixed(2) : '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          {c.live.totalTrades}
                          {!c.hasEnoughLiveData && c.live.totalTrades > 0 && (
                            <Badge variant="outline" className="ml-1 text-[9px] border-yellow-500/40 text-yellow-400">amostra pequena</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {c.paused ? (
                            <Badge className="bg-muted text-muted-foreground text-[10px]">pausada</Badge>
                          ) : c.divergent ? (
                            <Badge className="bg-red-500/20 text-red-400 text-[10px]">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {c.usedAbsoluteFallback ? 'PF < 1.0 (sem baseline)' : 'divergindo'}
                            </Badge>
                          ) : c.hasEnoughLiveData ? (
                            <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">condizente</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">aguardando amostra</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] px-2"
                            disabled={togglingCombo === comboKey}
                            onClick={() => toggleComboPause(c)}
                          >
                            {togglingCombo === comboKey ? '...' : c.paused ? 'Reativar' : 'Pausar'}
                          </Button>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                "Divergindo" = pelo menos 10 trades ao vivo nesse período E o profit factor real ficou 0,5 ou mais
                abaixo do previsto pelo backtest (ou, sem baseline de backtest pra comparar, PF ao vivo abaixo de
                1.0). Com menos de 10 trades, qualquer diferença pode ser só ruído estatístico — não é sinalizado
                como divergência ainda. Combinações divergentes 3 checagens diárias seguidas são pausadas
                automaticamente; "Pausar"/"Reativar" faz isso na hora, manualmente.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-display flex items-center gap-2">
                <FlaskConical className="w-4 h-4" /> Estabilidade fora da amostra
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Quebra o backtest de cada combinação ao vivo em 2 pedaços cronológicos — se o resultado bom do
                período inteiro depende só de um dos pedaços, o padrão pode não ser real.
                {stabilityLastRun && <> Última rodada: {new Date(stabilityLastRun).toLocaleString('pt-BR')}.</>}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadStability} disabled={loadingStability}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingStability ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stabilityResults.length === 0 ? (
            <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
              Nenhum resultado ainda — rode <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">npm run stability:scan</code> ou
              espere o agendador rodar a checagem semanal automática.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Moeda</TableHead>
                    <TableHead>Estratégia</TableHead>
                    <TableHead>TF</TableHead>
                    <TableHead className="text-right">Trades</TableHead>
                    <TableHead className="text-right">PF geral</TableHead>
                    <TableHead className="text-right">Pedaços</TableHead>
                    <TableHead className="text-right">Veredito</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stabilityResults.map((r: any, i: number) => (
                    <TableRow key={i} className={r.paused ? 'opacity-50' : r.verdict === 'INSTAVEL' ? 'bg-red-500/5' : ''}>
                      <TableCell className="font-mono text-xs">{r.pair.replace('USDT', '/USDT')}</TableCell>
                      <TableCell className="text-xs">{r.strategyName}</TableCell>
                      <TableCell className="text-xs">{r.timeframe}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.totalTrades}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{r.overallPF.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">[{r.bucketPFs.map((p: number) => p.toFixed(2)).join(', ')}]</TableCell>
                      <TableCell className="text-right">
                        {r.paused ? (
                          <Badge className="bg-muted text-muted-foreground text-[10px]">pausada</Badge>
                        ) : r.verdict === 'INSTAVEL' ? (
                          <Badge className="bg-red-500/20 text-red-400 text-[10px]"><AlertTriangle className="w-3 h-3 mr-1" />instável</Badge>
                        ) : r.verdict === 'ALTA_VARIANCIA' ? (
                          <Badge className="bg-yellow-500/20 text-yellow-400 text-[10px]">alta variância</Badge>
                        ) : r.verdict === 'ESTAVEL' ? (
                          <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">estável</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">amostra insuficiente</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            "Instável" = PF geral positivo, mas pelo menos um pedaço do período teve PF abaixo de 1.0 — o edge pode
            estar concentrado num sub-período específico. "Alta variância" = todos os pedaços ≥ 1.0, mas com
            oscilação grande entre eles. Nenhum veredito aqui pausa nada sozinho — isso é sobre o backtest ser
            consistente no tempo, um sinal diferente do PF ao vivo (ver "Backtest vs Ao Vivo" acima).
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-display">Configurar backtest</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Estratégia</label>
              <Select value={String(strategyId)} onValueChange={handleStrategyChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STRATEGIES.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Par</label>
              <Select value={pair} onValueChange={setPair}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAIRS.map((p) => (
                    <SelectItem key={p} value={p}>{p.replace('USDT', '/USDT')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Timeframe</label>
              <Select value={timeframe} onValueChange={setTimeframe} disabled={isFunding}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currentStrategy.timeframes.map((tf) => (
                    <SelectItem key={tf} value={tf}>{tf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isFunding && <p className="text-[10px] text-muted-foreground mt-1">Funding Extremo sempre usa 1h</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Período</label>
              <Select value={months} onValueChange={setMonths}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="mt-4" onClick={runBacktest} disabled={running}>
            <Play className={`w-4 h-4 mr-2 ${running ? 'animate-pulse' : ''}`} />
            {running ? 'Rodando (pode levar até 1 min)...' : 'Rodar Backtest'}
          </Button>
        </CardContent>
      </Card>

      {/* Relatório do Scan em Massa */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-display flex items-center gap-2"><ListChecks className="w-4 h-4" /> Relatório do Scan em Massa</CardTitle>
              <CardDescription>
                Resultado de todas as combinações estratégia × moeda × timeframe já rodadas via terminal
                (<code className="text-[10px] bg-muted/50 px-1 py-0.5 rounded">npm run backtest:scan</code>)
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadScanResults} disabled={loadingScan}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loadingScan ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a href="/api/backtest/scan-results/csv" download>
                <Download className="w-4 h-4 mr-2" /> Baixar scan completo (CSV)
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {scanResults.length === 0 ? (
            <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
              Nenhum resultado ainda. Rode <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">npm run backtest:scan</code> num
              terminal (pode levar bastante tempo — dezenas de combinações, cada uma buscando histórico real da Binance) e clique em
              "Atualizar" aqui pra ver o relatório conforme ele for sendo preenchido.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Mínimo de trades:</Label>
                <Input type="number" min={0} value={minTrades} onChange={(e: any) => setMinTrades(Number(e?.target?.value ?? 0))} className="w-20 h-8" />
                <span className="text-xs text-muted-foreground">
                  Mostrando {filteredScanResults.length} de {scanResults.length} combinações — amostras pequenas dizem pouco, filtre por trades suficientes antes de confiar.
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Moeda</TableHead>
                      <TableHead>Estratégia</TableHead>
                      <TableHead>TF</TableHead>
                      <SortableHead label="Trades" field="totalTrades" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Win Rate" field="winRate" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Profit Factor" field="profitFactor" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Expectativa" field="expectancy" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                      <TableHead className="text-right">Drawdown</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredScanResults.slice(0, 150).map((r: any) => {
                      const promising = r.profitFactor >= 1.5 && r.expectancy > 0 && r.totalTrades >= 20;
                      return (
                        <TableRow key={r.id} className={promising ? 'bg-emerald-500/5' : ''}>
                          <TableCell className="font-mono text-xs">{r.pair.replace('USDT', '/USDT')}</TableCell>
                          <TableCell className="text-xs">{r.strategyName}</TableCell>
                          <TableCell className="text-xs">{r.timeframe}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.totalTrades}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.winRate.toFixed(1)}%</TableCell>
                          <TableCell className={`text-right font-mono text-xs ${r.profitFactor >= 1.5 ? 'text-emerald-400' : r.profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {r.profitFactor.toFixed(2)}
                            {promising && <Badge className="ml-1.5 bg-emerald-500/20 text-emerald-400 text-[10px]">promissor</Badge>}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-xs ${r.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {r.expectancy >= 0 ? '+' : ''}{r.expectancy.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-red-400">{r.maxDrawdown.toFixed(1)}%</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredScanResults.length > 150 && (
                  <p className="text-xs text-muted-foreground mt-2">Mostrando as 150 primeiras de {filteredScanResults.length} combinações — refine o filtro de trades mínimos pra ver menos linhas.</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {result && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Trades Simulados" value={m.totalTrades} />
            <SummaryCard label="Win Rate" value={`${m.winRate.toFixed(1)}%`} color={m.winRate >= 50 ? 'text-emerald-400' : 'text-yellow-400'} />
            <SummaryCard label="Profit Factor" value={m.profitFactor.toFixed(2)} color={m.profitFactor >= 1.5 ? 'text-emerald-400' : m.profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400'} />
            <SummaryCard label="Expectativa" value={`${m.expectancy >= 0 ? '+' : ''}${m.expectancy.toFixed(2)}%`} color={m.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Payoff" value={`${m.payoff.toFixed(2)}x`} />
            <SummaryCard label="Drawdown Máx" value={`${m.maxDrawdown.toFixed(1)}%`} color="text-red-400" />
            <SummaryCard label="Wins" value={m.wins} color="text-emerald-400" />
            <SummaryCard label="Losses" value={m.losses} color="text-red-400" />
          </div>

          <p className="text-xs text-muted-foreground">
            Período simulado: {new Date(result.periodStart).toLocaleDateString('pt-BR')} até {new Date(result.periodEnd).toLocaleDateString('pt-BR')}
            {' · '}{result.candlesAnalyzed} candles analisados{' · '}taxas de {result.feesApplied}% já descontadas por trade
          </p>

          {(result.trades?.length ?? 0) > 0 && (
            <Card className="bg-card/80 border-border/50">
              <CardHeader>
                <CardTitle className="text-sm font-display">Trades simulados ({result.trades.length})</CardTitle>
                <CardDescription>Mostrando os mais recentes primeiro</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Direção</TableHead>
                      <TableHead className="text-right">Entrada</TableHead>
                      <TableHead className="text-right">Saída</TableHead>
                      <TableHead className="text-right">Resultado</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...result.trades].reverse().slice(0, 100).map((t: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{new Date(t.entryTime).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${t.direction === 'LONG' ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400'}`}>
                            {t.direction === 'LONG' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                            {t.direction}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatPrice(t.entryPrice)}</TableCell>
                        <TableCell className="text-right font-mono text-xs">{formatPrice(t.status === 'WIN' ? t.target1 : t.stopLoss)}</TableCell>
                        <TableCell className={`text-right font-mono text-xs ${t.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent.toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge className={`text-xs ${t.status === 'WIN' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{t.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {result.trades.length > 100 && (
                  <p className="text-xs text-muted-foreground mt-2">Mostrando os 100 mais recentes de {result.trades.length} trades.</p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <Card className="bg-card/80 border-border/50">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground mb-1">{label}</p>
        <p className={`text-xl font-bold font-mono ${color ?? 'text-foreground'}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function SortableHead({ label, field, sortField, sortDir, onSort }: {
  label: string;
  field: string;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: any) => void;
}) {
  const active = sortField === field;
  return (
    <TableHead className="text-right cursor-pointer select-none" onClick={() => onSort(field)}>
      <span className={`inline-flex items-center gap-1 ${active ? 'text-primary' : ''}`}>
        {label}
        <ArrowUpDown className="w-3 h-3" />
        {active && <span className="text-[10px]">{sortDir === 'desc' ? '↓' : '↑'}</span>}
      </span>
    </TableHead>
  );
}
