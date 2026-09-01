'use client';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { Radar, RefreshCw, Search, Target, ShieldAlert, Play, FlaskConical, ListChecks, ArrowUpDown, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatPrice } from '@/lib/utils';
import { toast } from 'sonner';

const STRATEGIES = [
  { id: 1, name: 'Rompimento de Range', timeframes: ['15m', '1h', '4h'], regimes: 'Lateralização' },
  { id: 2, name: 'Pullback na EMA20 ✅ em produção', timeframes: ['1h', '4h'], regimes: 'Alta/Baixa em Correção' },
  { id: 3, name: 'Trap de Liquidez (fora do esquema)', timeframes: ['1h'], regimes: 'Nenhum — piorou nos testes, removida' },
  { id: 4, name: 'Funding Extremo', timeframes: ['1h'], regimes: 'Alta/Baixa (alinhamento total)' },
  { id: 5, name: 'Reversão após Liquidação ⭐ melhor do projeto', timeframes: ['5m'], regimes: 'Nenhum — sem filtro, sozinho já é PF 1,48 médio / 63,5% lucrativa em 5m' },
  { id: 6, name: 'Compressão de Volatilidade', timeframes: ['1h', '4h', '1d'], regimes: 'Lateralização' },
];

export default function RadarPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [testPair, setTestPair] = useState('');

  const [ctxStrategyId, setCtxStrategyId] = useState(2);
  const [ctxPair, setCtxPair] = useState('ETHUSDT');
  const [ctxTimeframe, setCtxTimeframe] = useState('1h');
  const [ctxMonths, setCtxMonths] = useState('2');
  const [ctxRunning, setCtxRunning] = useState(false);
  const [ctxResult, setCtxResult] = useState<any>(null);

  const [btPair, setBtPair] = useState('BTCUSDT');
  const [btTimeframe, setBtTimeframe] = useState('1h');
  const [btMonths, setBtMonths] = useState('2');
  const [btVersion, setBtVersion] = useState('v1');
  const [btRunning, setBtRunning] = useState(false);
  const [btResult, setBtResult] = useState<any>(null);

  const [ctrlRunning, setCtrlRunning] = useState(false);
  const [ctrlResult, setCtrlResult] = useState<any>(null);

  const [scanResults, setScanResults] = useState<any[]>([]);
  const [loadingScan, setLoadingScan] = useState(false);
  const [scanMinTrades, setScanMinTrades] = useState(10);
  const [scanSortField, setScanSortField] = useState<'filteredPF' | 'unfilteredPF' | 'filteredExp' | 'totalAccepted'>('filteredPF');
  const [scanSortDir, setScanSortDir] = useState<'asc' | 'desc'>('desc');

  const loadScanResults = useCallback(async () => {
    setLoadingScan(true);
    try {
      const res = await fetch('/api/radar/context-scan-results');
      const json = await res.json();
      if (res.ok) setScanResults(json?.results ?? []);
      else toast.error(json?.error ?? 'Erro ao carregar relatório');
    } catch {
      toast.error('Erro ao carregar relatório');
    } finally {
      setLoadingScan(false);
    }
  }, []);

  useEffect(() => { loadScanResults(); }, [loadScanResults]);

  const toggleScanSort = (field: typeof scanSortField) => {
    if (scanSortField === field) setScanSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    else { setScanSortField(field); setScanSortDir('desc'); }
  };

  const filteredScanResults = useMemo(() => {
    const filtered = scanResults.filter((r) => (r?.filteredTrades ?? 0) >= scanMinTrades);
    return [...filtered].sort((a, b) => {
      const diff = (a?.[scanSortField] ?? 0) - (b?.[scanSortField] ?? 0);
      return scanSortDir === 'desc' ? -diff : diff;
    });
  }, [scanResults, scanMinTrades, scanSortField, scanSortDir]);

  const load = useCallback(async (pair?: string) => {
    setLoading(true);
    try {
      const url = pair ? `/api/radar/data-check?pair=${encodeURIComponent(pair)}` : '/api/radar/data-check';
      const res = await fetch(url);
      const json = await res.json();
      if (res.ok) {
        setData(json);
      } else {
        toast.error(json?.error ?? 'Erro ao carregar');
      }
    } catch {
      toast.error('Erro ao carregar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runScoreBacktest = useCallback(async () => {
    setBtRunning(true);
    setBtResult(null);
    try {
      const endpoint = btVersion === 'v2' ? '/api/radar/backtest-score-v2' : '/api/radar/backtest-score';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair: btPair, timeframe: btTimeframe, months: Number(btMonths) }),
      });
      const json = await res.json();
      if (res.ok) {
        setBtResult(json);
        toast.success(`${json.trades.length} candidato(s) simulado(s) de ${json.totalCandidatesScored} avaliado(s).`);
      } else {
        toast.error(json?.error ?? 'Erro ao rodar backtest');
      }
    } catch {
      toast.error('Erro ao rodar backtest — períodos longos em timeframes curtos podem demorar, tenta um período menor.');
    } finally {
      setBtRunning(false);
    }
  }, [btPair, btTimeframe, btMonths, btVersion]);

  const runControlBacktest = useCallback(async () => {
    setCtrlRunning(true);
    setCtrlResult(null);
    try {
      const res = await fetch('/api/radar/backtest-control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair: btPair, timeframe: btTimeframe, months: Number(btMonths) }),
      });
      const json = await res.json();
      if (res.ok) {
        setCtrlResult(json);
        toast.success(`Controle: ${json.trades.length} trade(s) sem filtro nenhum.`);
      } else {
        toast.error(json?.error ?? 'Erro ao rodar controle');
      }
    } catch {
      toast.error('Erro ao rodar controle');
    } finally {
      setCtrlRunning(false);
    }
  }, [btPair, btTimeframe, btMonths]);

  const runContextBacktest = useCallback(async () => {
    setCtxRunning(true);
    setCtxResult(null);
    try {
      const res = await fetch('/api/radar/backtest-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId: ctxStrategyId, pair: ctxPair, timeframe: ctxTimeframe, months: Number(ctxMonths) }),
      });
      const json = await res.json();
      if (res.ok) {
        setCtxResult(json);
        toast.success(`${json.totalSignalsDetected} sinal(is) detectado(s), ${json.totalAcceptedByRegime} aceito(s) pelo filtro de regime.`);
      } else {
        toast.error(json?.error ?? 'Erro ao rodar backtest');
      }
    } catch {
      toast.error('Erro ao rodar backtest');
    } finally {
      setCtxRunning(false);
    }
  }, [ctxStrategyId, ctxPair, ctxTimeframe, ctxMonths]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
          <Radar className="w-6 h-6 text-primary" /> Radar <span className="text-xs font-normal text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">em construção</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Camada de dados — universo dinâmico de pares e indicadores, base pro classificador de regime que vem a seguir</p>
      </div>

      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-display">Universo (top {data?.universeSize ?? '...'} por volume)</CardTitle>
              <CardDescription>Contratos perpétuos USDT-M da Binance Futures, ranqueados por volume real das últimas 24h</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Par</TableHead>
                  <TableHead className="text-right">Volume 24h (USDT)</TableHead>
                  <TableHead className="text-right">Variação 24h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.universe ?? []).map((p: any, i: number) => (
                  <TableRow key={p.symbol}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs">{p.symbol.replace('USDT', '/USDT')}</TableCell>
                    <TableCell className="text-right font-mono text-xs">${(p.quoteVolume / 1e6).toFixed(1)}M</TableCell>
                    <TableCell className={`text-right font-mono text-xs ${p.priceChangePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {p.priceChangePercent >= 0 ? '+' : ''}{p.priceChangePercent.toFixed(2)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-display">Testar indicadores num par</CardTitle>
          <CardDescription>Confere se VWAP, MACD, ROC e ATR estão saindo certos antes de virarem filtro de contexto</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Input placeholder="Ex: BTCUSDT" value={testPair} onChange={(e: any) => setTestPair(e?.target?.value?.toUpperCase() ?? '')} className="max-w-[200px]" />
            <Button variant="outline" size="sm" onClick={() => load(testPair || undefined)} disabled={loading}>
              <Search className="w-4 h-4 mr-2" /> Testar
            </Button>
          </div>
          {data?.sample && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Par" value={data.sample.pair} />
              <Stat label="Preço atual" value={formatPrice(data.sample.lastPrice)} />
              <Stat label="VWAP (dia)" value={data.sample.vwap ? formatPrice(data.sample.vwap) : '—'} />
              <Stat label="Preço vs VWAP" value={data.sample.priceAboveVwap === null ? '—' : data.sample.priceAboveVwap ? 'Acima' : 'Abaixo'} color={data.sample.priceAboveVwap ? 'text-emerald-400' : 'text-red-400'} />
              <Stat label="MACD" value={data.sample.macd ? data.sample.macd.macd.toFixed(4) : '—'} />
              <Stat label="MACD Sinal" value={data.sample.macd ? data.sample.macd.signal.toFixed(4) : '—'} />
              <Stat label="MACD Histograma" value={data.sample.macd ? data.sample.macd.histogram.toFixed(4) : '—'} color={data.sample.macd?.histogram >= 0 ? 'text-emerald-400' : 'text-red-400'} />
              <Stat label="ROC (12)" value={data.sample.roc !== null ? `${data.sample.roc.toFixed(2)}%` : '—'} color={data.sample.roc >= 0 ? 'text-emerald-400' : 'text-red-400'} />
              <Stat label="ATR (14)" value={data.sample.atr ? data.sample.atr.toFixed(4) : '—'} />
              <Stat label="EMA20" value={data.sample.ema20 ? formatPrice(data.sample.ema20) : '—'} />
              <Stat label="Candles usados" value={data.sample.candlesUsed} />
            </div>
          )}
        </CardContent>
      </Card>

      {data?.regime && (
        <Card className="bg-card/80 border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-display">Regime de mercado (1h)</CardTitle>
            <CardDescription>Estrutura (EMA50/200) + timing (EMA20/50, VWAP) + volatilidade — a peça que consome os indicadores acima</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <span className={`px-3 py-1.5 rounded-lg text-sm font-bold ${regimeColor(data.regime.regime)}`}>
                {regimeLabel(data.regime.regime)}
              </span>
              <span className="text-xs text-muted-foreground">
                Força: <strong className="text-foreground">{(data.regime.force * 100).toFixed(0)}%</strong> dos 3 sinais alinhados
              </span>
              <span className={`text-xs px-2 py-1 rounded-full ${data.regime.hasQuality ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                {data.regime.hasQuality ? 'Liquidez OK' : 'Volume recente murchando'}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="EMA20" value={formatPrice(data.regime.details.ema20)} />
              <Stat label="EMA50" value={formatPrice(data.regime.details.ema50)} />
              <Stat label="EMA200" value={formatPrice(data.regime.details.ema200)} />
              <Stat label="VWAP" value={data.regime.details.vwap ? formatPrice(data.regime.details.vwap) : '—'} />
              <Stat label="ATR recente/normal" value={`${data.regime.details.atrRatio.toFixed(2)}x`} color={data.regime.details.atrRatio > 1.3 ? 'text-yellow-400' : 'text-foreground'} />
              <Stat label="Volume recente/normal" value={`${data.regime.details.volumeRatio.toFixed(2)}x`} color={data.regime.details.volumeRatio < 0.3 ? 'text-yellow-400' : 'text-foreground'} />
            </div>
          </CardContent>
        </Card>
      )}

      {data?.score && (
        <Card className="bg-card/80 border-border/50">
          <CardHeader>
            <CardTitle className="text-sm font-display flex items-center gap-2"><Target className="w-4 h-4" /> Score do Setup</CardTitle>
            <CardDescription>Confluência dos filtros — pesos são ponto de partida do documento, ainda não validados por backtest</CardDescription>
          </CardHeader>
          <CardContent>
            {data.score.rejectionReason ? (
              <div className="flex items-start gap-2 text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <p>Sem setup avaliável: {data.score.rejectionReason}</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4 flex-wrap">
                  <span className="text-3xl font-mono font-bold">{data.score.score}<span className="text-sm text-muted-foreground">/100</span></span>
                  <Badge className={scoreClassColor(data.score.classification)}>{scoreClassLabel(data.score.classification)}</Badge>
                  <Badge variant="outline" className={data.score.direction === 'LONG' ? 'border-emerald-500/50 text-emerald-400' : 'border-red-500/50 text-red-400'}>
                    {data.score.direction}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <ScoreBar label="Tendência" value={data.score.breakdown.trend} max={25} />
                  <ScoreBar label="Momentum" value={data.score.breakdown.momentum} max={20} />
                  <ScoreBar label="Volume" value={data.score.breakdown.volume} max={15} />
                  <ScoreBar label="Open Interest" value={data.score.breakdown.openInterest} max={15} />
                  <ScoreBar label="Funding" value={data.score.breakdown.funding} max={10} />
                  <ScoreBar label="Risco/Retorno" value={data.score.breakdown.riskReward} max={10} />
                  <ScoreBar label="Liquidez" value={data.score.breakdown.liquidity} max={5} />
                </div>

                {data.score.levels && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <Stat label="Entrada" value={formatPrice(data.score.levels.entry)} />
                    <Stat label="Alvo 1" value={formatPrice(data.score.levels.target1)} color="text-emerald-400" />
                    <Stat label="Alvo 2" value={formatPrice(data.score.levels.target2)} color="text-emerald-400" />
                    <Stat label="Stop" value={formatPrice(data.score.levels.stop)} color="text-red-400" />
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Backtest do Score */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-display flex items-center gap-2"><FlaskConical className="w-4 h-4" /> Score alto prevê resultado bom?</CardTitle>
          <CardDescription>Roda o mesmo score contra o histórico real e separa por faixa — só assim dá pra confiar nos pesos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 mb-4">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Esse backtest calcula o score <strong>sem o componente de Open Interest</strong> (15 pts) — o histórico
              da Binance não cobre períodos longos o suficiente pra isso. Máximo possível aqui é <strong>85</strong>,
              não 100. O OI só dá pra validar observando o robô rodando ao vivo por um tempo.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Par</label>
              <Input value={btPair} onChange={(e: any) => setBtPair(e?.target?.value?.toUpperCase() ?? '')} placeholder="Ex: BTCUSDT" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Timeframe</label>
              <Select value={btTimeframe} onValueChange={setBtTimeframe}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15m">15m</SelectItem>
                  <SelectItem value="1h">1h</SelectItem>
                  <SelectItem value="4h">4h</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Período</label>
              <Select value={btMonths} onValueChange={setBtMonths}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Último mês</SelectItem>
                  <SelectItem value="2">Últimos 2 meses</SelectItem>
                  <SelectItem value="3">Últimos 3 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Versão do score</label>
              <Select value={btVersion} onValueChange={setBtVersion}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="v1">v1 — Clássico (alinhamento)</SelectItem>
                  <SelectItem value="v2">v2 — Invertido (correção)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={runScoreBacktest} disabled={btRunning} className="w-full">
                <Play className={`w-4 h-4 mr-2 ${btRunning ? 'animate-pulse' : ''}`} />
                {btRunning ? 'Rodando...' : 'Rodar'}
              </Button>
            </div>
          </div>

          {btResult && (
            <>
              <p className="text-xs text-muted-foreground mb-1">
                {btResult.totalCandidatesScored} candidato(s) direcionais avaliados, {btResult.trades.length} viraram trade simulado
                (resto expirou sem bater alvo nem stop) — período de {new Date(btResult.periodStart).toLocaleDateString('pt-BR')} até {new Date(btResult.periodEnd).toLocaleDateString('pt-BR')}.
              </p>
              <p className="text-xs text-primary mb-3">{btResult.note}</p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Faixa de Score</TableHead>
                      <TableHead className="text-right">Trades</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">Profit Factor</TableHead>
                      <TableHead className="text-right">Expectativa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {btResult.bins.map((b: any) => (
                      <TableRow key={b.label}>
                        <TableCell className="text-sm font-medium">{b.label}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{b.metrics.totalTrades}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{b.metrics.totalTrades > 0 ? `${b.metrics.winRate.toFixed(1)}%` : '—'}</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${b.metrics.totalTrades > 0 ? (b.metrics.profitFactor >= 1.5 ? 'text-emerald-400' : b.metrics.profitFactor >= 1 ? 'text-yellow-400' : 'text-red-400') : ''}`}>
                          {b.metrics.totalTrades > 0 ? b.metrics.profitFactor.toFixed(2) : '—'}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${b.metrics.totalTrades > 0 ? (b.metrics.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400') : ''}`}>
                          {b.metrics.totalTrades > 0 ? `${b.metrics.expectancy >= 0 ? '+' : ''}${b.metrics.expectancy.toFixed(2)}%` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Se o score fizer sentido, o profit factor deveria subir de cima pra baixo nessa tabela (faixas mais
                altas = melhor resultado). Se não subir, ou subir e descer sem padrão, os pesos precisam de ajuste
                antes de confiar neles.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Grupo de Controle — sem score */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-display flex items-center gap-2"><Target className="w-4 h-4" /> Grupo de controle (sem score)</CardTitle>
              <CardDescription>Entra em TODA combinação onde o regime dá direção, sem filtrar por nada — usa o mesmo par/timeframe/período configurados acima</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={runControlBacktest} disabled={ctrlRunning}>
              <Play className={`w-4 h-4 mr-2 ${ctrlRunning ? 'animate-pulse' : ''}`} />
              {ctrlRunning ? 'Rodando...' : `Rodar controle (${btPair})`}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {ctrlResult && (
            <>
              <p className="text-xs text-muted-foreground mb-1">
                {ctrlResult.totalCandidatesEvaluated} candidato(s) direcionais, {ctrlResult.trades.length} viraram trade —
                período de {new Date(ctrlResult.periodStart).toLocaleDateString('pt-BR')} até {new Date(ctrlResult.periodEnd).toLocaleDateString('pt-BR')}.
              </p>

              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 my-3">
                <p className="text-xs text-muted-foreground mb-1">Resultado geral (todo mundo junto, sem score)</p>
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="text-sm font-mono">Trades: <strong>{ctrlResult.overallMetrics.totalTrades}</strong></span>
                  <span className="text-sm font-mono">Win Rate: <strong>{ctrlResult.overallMetrics.winRate.toFixed(1)}%</strong></span>
                  <span className={`text-sm font-mono ${ctrlResult.overallMetrics.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>
                    PF: <strong>{ctrlResult.overallMetrics.profitFactor.toFixed(2)}</strong>
                  </span>
                  <span className={`text-sm font-mono ${ctrlResult.overallMetrics.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    Exp: <strong>{ctrlResult.overallMetrics.expectancy >= 0 ? '+' : ''}{ctrlResult.overallMetrics.expectancy.toFixed(2)}%</strong>
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground mb-2">Quebra por tipo de regime (isolado, sem momentum/volume/funding misturados):</p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Regime</TableHead>
                      <TableHead className="text-right">Trades</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">Profit Factor</TableHead>
                      <TableHead className="text-right">Expectativa</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ctrlResult.byRegime.map((r: any) => (
                      <TableRow key={r.regime}>
                        <TableCell><span className={`text-xs px-2 py-1 rounded-full ${regimeColor(r.regime)}`}>{regimeLabel(r.regime)}</span></TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.metrics.totalTrades}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{r.metrics.totalTrades > 0 ? `${r.metrics.winRate.toFixed(1)}%` : '—'}</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${r.metrics.totalTrades > 0 ? (r.metrics.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400') : ''}`}>
                          {r.metrics.totalTrades > 0 ? r.metrics.profitFactor.toFixed(2) : '—'}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm ${r.metrics.totalTrades > 0 ? (r.metrics.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400') : ''}`}>
                          {r.metrics.totalTrades > 0 ? `${r.metrics.expectancy >= 0 ? '+' : ''}${r.metrics.expectancy.toFixed(2)}%` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Se o controle (sem score) tiver resultado parecido com as tabelas de score acima, o problema é o
                gatilho de entrada (regime sozinho não basta). Se o controle for bem pior, os filtros do score
                estão de fato ajudando — só os pesos precisam de ajuste.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Gatilho validado + filtro de regime */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-display flex items-center gap-2"><Radar className="w-4 h-4" /> Gatilho validado + filtro de regime</CardTitle>
          <CardDescription>Usa os detectores das 6 estratégias curadas (já provados), só aceitando o sinal quando o regime bate com o contexto certo pra cada um</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Estratégia</label>
              <Select value={String(ctxStrategyId)} onValueChange={(v) => {
                const id = Number(v);
                setCtxStrategyId(id);
                const strat = STRATEGIES.find((s) => s.id === id)!;
                if (!strat.timeframes.includes(ctxTimeframe)) setCtxTimeframe(strat.timeframes[0]);
              }}>
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
              <Input value={ctxPair} onChange={(e: any) => setCtxPair(e?.target?.value?.toUpperCase() ?? '')} placeholder="Ex: ETHUSDT" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Timeframe</label>
              <Select value={ctxTimeframe} onValueChange={setCtxTimeframe} disabled={ctxStrategyId === 4}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(STRATEGIES.find((s) => s.id === ctxStrategyId)?.timeframes ?? []).map((tf) => (
                    <SelectItem key={tf} value={tf}>{tf}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Período</label>
              <Select value={ctxMonths} onValueChange={setCtxMonths}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Último mês</SelectItem>
                  <SelectItem value="2">Últimos 2 meses</SelectItem>
                  <SelectItem value="3">Últimos 3 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={runContextBacktest} disabled={ctxRunning} className="w-full">
                <Play className={`w-4 h-4 mr-2 ${ctxRunning ? 'animate-pulse' : ''}`} />
                {ctxRunning ? 'Rodando...' : 'Rodar'}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            Regimes que liberam essa estratégia: <strong className="text-foreground">{STRATEGIES.find((s) => s.id === ctxStrategyId)?.regimes}</strong>
          </p>

          {ctxResult && (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                {ctxResult.totalSignalsDetected} sinal(is) detectado(s) pelo gatilho no total, {ctxResult.totalAcceptedByRegime} aceito(s)
                depois do filtro de regime — período de {new Date(ctxResult.periodStart).toLocaleDateString('pt-BR')} até {new Date(ctxResult.periodEnd).toLocaleDateString('pt-BR')}.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-2">Gatilho sozinho (sem filtro de regime)</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Trades</span><span className="font-mono">{ctxResult.unfilteredMetrics.totalTrades}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Win Rate</span><span className="font-mono">{ctxResult.unfilteredMetrics.winRate.toFixed(1)}%</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Profit Factor</span><span className={`font-mono ${ctxResult.unfilteredMetrics.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>{ctxResult.unfilteredMetrics.profitFactor.toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Expectativa</span><span className={`font-mono ${ctxResult.unfilteredMetrics.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{ctxResult.unfilteredMetrics.expectancy >= 0 ? '+' : ''}{ctxResult.unfilteredMetrics.expectancy.toFixed(2)}%</span></div>
                  </div>
                </div>
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                  <p className="text-xs text-muted-foreground mb-2">Gatilho + filtro de regime</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Trades</span><span className="font-mono">{ctxResult.filteredMetrics.totalTrades}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Win Rate</span><span className="font-mono">{ctxResult.filteredMetrics.totalTrades > 0 ? `${ctxResult.filteredMetrics.winRate.toFixed(1)}%` : '—'}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Profit Factor</span><span className={`font-mono ${ctxResult.filteredMetrics.totalTrades > 0 ? (ctxResult.filteredMetrics.profitFactor >= 1 ? 'text-emerald-400' : 'text-red-400') : ''}`}>{ctxResult.filteredMetrics.totalTrades > 0 ? ctxResult.filteredMetrics.profitFactor.toFixed(2) : '—'}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-muted-foreground">Expectativa</span><span className={`font-mono ${ctxResult.filteredMetrics.totalTrades > 0 ? (ctxResult.filteredMetrics.expectancy >= 0 ? 'text-emerald-400' : 'text-red-400') : ''}`}>{ctxResult.filteredMetrics.totalTrades > 0 ? `${ctxResult.filteredMetrics.expectancy >= 0 ? '+' : ''}${ctxResult.filteredMetrics.expectancy.toFixed(2)}%` : '—'}</span></div>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Se o filtro de regime funcionar, a caixa da direita deve ter profit factor e expectativa melhores
                que a da esquerda (mesmo com menos trades — qualidade em vez de quantidade).
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* Relatório do Scan de Contexto (100 pares) */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-display flex items-center gap-2"><ListChecks className="w-4 h-4" /> Relatório do Scan de Contexto (universo de 100 pares)</CardTitle>
              <CardDescription>
                Resultado de todas as combinações rodadas via terminal
                (<code className="text-[10px] bg-muted/50 px-1 py-0.5 rounded">npm run radar:scan</code>) — não a lista curada, o universo dinâmico inteiro
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={loadScanResults} disabled={loadingScan}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loadingScan ? 'animate-spin' : ''}`} /> Atualizar
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="/api/radar/context-scan-results/csv" download>
                  <Download className="w-4 h-4 mr-2" /> Baixar CSV completo
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {scanResults.length === 0 ? (
            <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4">
              Nenhum resultado ainda. Rode <code className="text-xs bg-muted/50 px-1 py-0.5 rounded">npm run radar:scan</code> num
              terminal — são até ~1.100 combinações (5 estratégias × timeframes × 100 pares), pode levar várias horas.
              Deixe rodando em background e clique em "Atualizar" pra ver o relatório enchendo aos poucos.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <label className="text-xs text-muted-foreground whitespace-nowrap">Mínimo de trades filtrados:</label>
                <Input type="number" min={0} value={scanMinTrades} onChange={(e: any) => setScanMinTrades(Number(e?.target?.value ?? 0))} className="w-20 h-8" />
                <span className="text-xs text-muted-foreground">
                  Mostrando {filteredScanResults.length} de {scanResults.length} combinações
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Moeda</TableHead>
                      <TableHead>Estratégia</TableHead>
                      <TableHead>TF</TableHead>
                      <ScanSortableHead label="Aceitos" field="totalAccepted" sortField={scanSortField} sortDir={scanSortDir} onSort={toggleScanSort} />
                      <ScanSortableHead label="PF Sozinho" field="unfilteredPF" sortField={scanSortField} sortDir={scanSortDir} onSort={toggleScanSort} />
                      <ScanSortableHead label="PF Filtrado" field="filteredPF" sortField={scanSortField} sortDir={scanSortDir} onSort={toggleScanSort} />
                      <ScanSortableHead label="Exp. Filtrada" field="filteredExp" sortField={scanSortField} sortDir={scanSortDir} onSort={toggleScanSort} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredScanResults.slice(0, 150).map((r: any) => {
                      const improved = r.filteredPF > r.unfilteredPF && r.filteredExp > 0;
                      return (
                        <TableRow key={r.id} className={improved ? 'bg-emerald-500/5' : ''}>
                          <TableCell className="font-mono text-xs">{r.pair.replace('USDT', '/USDT')}</TableCell>
                          <TableCell className="text-xs">{r.strategyName}</TableCell>
                          <TableCell className="text-xs">{r.timeframe}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r.totalAccepted}</TableCell>
                          <TableCell className={`text-right font-mono text-xs ${r.unfilteredPF >= 1 ? 'text-emerald-400' : 'text-red-400'}`}>{r.unfilteredPF.toFixed(2)}</TableCell>
                          <TableCell className={`text-right font-mono text-xs ${r.filteredTrades > 0 ? (r.filteredPF >= 1 ? 'text-emerald-400' : 'text-red-400') : 'text-muted-foreground'}`}>
                            {r.filteredTrades > 0 ? r.filteredPF.toFixed(2) : '—'}
                            {improved && <Badge className="ml-1.5 bg-emerald-500/20 text-emerald-400 text-[10px]">melhorou</Badge>}
                          </TableCell>
                          <TableCell className={`text-right font-mono text-xs ${r.filteredTrades > 0 ? (r.filteredExp >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-muted-foreground'}`}>
                            {r.filteredTrades > 0 ? `${r.filteredExp >= 0 ? '+' : ''}${r.filteredExp.toFixed(2)}%` : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {filteredScanResults.length > 150 && (
                  <p className="text-xs text-muted-foreground mt-2">Mostrando as 150 primeiras de {filteredScanResults.length} — refine o filtro de trades mínimos ou baixe o CSV completo pra ver tudo.</p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ScanSortableHead({ label, field, sortField, sortDir, onSort }: {
  label: string; field: string; sortField: string; sortDir: 'asc' | 'desc'; onSort: (field: any) => void;
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

function scoreClassLabel(c: string): string {
  const labels: Record<string, string> = {
    NAO_OPERAR: 'Não operar',
    OBSERVAR: 'Observar',
    SINAL_QUALIFICADO: 'Sinal qualificado',
    SINAL_FORTE: 'Sinal forte',
  };
  return labels[c] ?? c;
}

function scoreClassColor(c: string): string {
  if (c === 'SINAL_FORTE') return 'bg-emerald-500/20 text-emerald-400';
  if (c === 'SINAL_QUALIFICADO') return 'bg-primary/20 text-primary';
  if (c === 'OBSERVAR') return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-muted text-muted-foreground';
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100;
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-xs font-mono font-bold">{value}/{max}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-400' : pct > 0 ? 'bg-yellow-400' : 'bg-muted-foreground/30'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function regimeLabel(regime: string): string {
  const labels: Record<string, string> = {
    ALTA: '📈 Alta',
    ALTA_CORRECAO: '📈 Alta em Correção',
    BAIXA: '📉 Baixa',
    BAIXA_CORRECAO: '📉 Baixa em Correção',
    LATERALIZACAO: '↔️ Lateralização',
    ALTA_VOLATILIDADE_SEM_DIRECAO: '⚡ Alta Volatilidade sem Direção',
  };
  return labels[regime] ?? regime;
}

function regimeColor(regime: string): string {
  if (regime === 'ALTA') return 'bg-emerald-500/20 text-emerald-400';
  if (regime === 'ALTA_CORRECAO') return 'bg-emerald-500/10 text-emerald-300';
  if (regime === 'BAIXA') return 'bg-red-500/20 text-red-400';
  if (regime === 'BAIXA_CORRECAO') return 'bg-red-500/10 text-red-300';
  if (regime === 'ALTA_VOLATILIDADE_SEM_DIRECAO') return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-muted text-muted-foreground';
}

function Stat({ label, value, color }: { label: string; value: any; color?: string }) {
  return (
    <div className="bg-muted/30 rounded-lg p-3">
      <p className="text-[10px] text-muted-foreground mb-1">{label}</p>
      <p className={`font-mono text-sm font-bold ${color ?? 'text-foreground'}`}>{value ?? '—'}</p>
    </div>
  );
}
