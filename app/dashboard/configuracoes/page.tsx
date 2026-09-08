'use client';
import { useState, useEffect, useCallback } from 'react';
import { Settings, Save, Mail, Layers, Clock, Coins, Send, Search, CheckCircle2, Sparkles, RotateCcw, Calculator } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

const ALL_PAIRS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'SUIUSDT', 'AVAXUSDT', 'LINKUSDT', 'LTCUSDT', 'TRXUSDT', 'XLMUSDT', 'UNIUSDT', 'DOTUSDT', 'BCHUSDT', 'DOGEUSDT', '1000PEPEUSDT', 'ZECUSDT', 'HYPEUSDT', 'WLDUSDT', 'TAOUSDT'];
const STRATEGIES = [
  { id: 1, name: 'Rompimento de Range', short: 'Range' },
  { id: 2, name: 'Pullback na EMA20', short: 'Pullback' },
  { id: 3, name: 'Trap de Liquidez', short: 'Trap' },
  { id: 4, name: 'Funding Extremo', short: 'Funding' },
  { id: 5, name: 'Reversão após Liquidação', short: 'Liquidação' },
  { id: 6, name: 'Compressão de Volatilidade', short: 'Squeeze' },
];
// Sugestão baseada em pesquisa de mercado (Kraken/Phemex/ASCN/KuCoin) trazida
// pelo usuário — é uma tradução nossa das categorias soltas do documento
// pras nossas 6 estratégias, não uma citação literal. Ponto de partida
// editável, não validado por backtest ainda.
const RESEARCH_SUGGESTION: Record<string, number[]> = {
  BTCUSDT: [1, 2, 4], ETHUSDT: [1, 2, 4], SOLUSDT: [1, 2, 6], XRPUSDT: [1, 3, 6], BNBUSDT: [1, 3, 6],
  ADAUSDT: [1, 2], SUIUSDT: [1, 2], AVAXUSDT: [1, 2], LINKUSDT: [1, 2], LTCUSDT: [3], TRXUSDT: [3],
  XLMUSDT: [3, 6], UNIUSDT: [1, 6], DOTUSDT: [1, 2], BCHUSDT: [2],
  DOGEUSDT: [1, 6], '1000PEPEUSDT': [1], ZECUSDT: [1, 6], HYPEUSDT: [1, 2, 6], WLDUSDT: [1, 4], TAOUSDT: [1, 6],
};

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [telegramChats, setTelegramChats] = useState<Array<{ chatId: string; name: string; lastMessage: string }>>([]);
  const [searchingChats, setSearchingChats] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [testingTelegramSignal, setTestingTelegramSignal] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/settings');
        const json = await res.json();
        setSettings(json?.settings ?? {});
      } catch (e: any) { console.error(e); }
    };
    load();
  }, []);

  const findTelegramChats = useCallback(async () => {
    setSearchingChats(true);
    try {
      const res = await fetch('/api/telegram/updates');
      const json = await res.json();
      if (res.ok) {
        setTelegramChats(json?.chats ?? []);
        if (!json?.chats?.length) {
          toast.info('Nenhuma conversa encontrada. Envie uma mensagem qualquer pro seu bot no Telegram e tente de novo.');
        }
      } else {
        toast.error(json?.error ?? 'Erro ao buscar conversas');
      }
    } catch {
      toast.error('Erro ao buscar conversas');
    } finally {
      setSearchingChats(false);
    }
  }, []);

  const testTelegram = useCallback(async () => {
    if (!settings?.telegramChatId) {
      toast.error('Preencha o Chat ID primeiro');
      return;
    }
    setTestingTelegram(true);
    try {
      const res = await fetch('/api/telegram/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: settings.telegramChatId }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success('Mensagem de teste enviada! Confira o Telegram.');
      } else {
        toast.error(json?.error ?? 'Erro ao enviar teste');
      }
    } catch {
      toast.error('Erro ao enviar teste');
    } finally {
      setTestingTelegram(false);
    }
  }, [settings?.telegramChatId]);

  const testTelegramSignal = useCallback(async () => {
    if (!settings?.telegramChatId) {
      toast.error('Preencha o Chat ID primeiro');
      return;
    }
    setTestingTelegramSignal(true);
    try {
      const res = await fetch('/api/telegram/test-signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: settings.telegramChatId }),
      });
      const json = await res.json();
      if (res.ok) {
        toast.success('Sinal de teste enviado! Se chegou certinho no Telegram, está tudo funcionando.');
      } else {
        toast.error(json?.error ?? 'Erro ao enviar sinal de teste');
      }
    } catch {
      toast.error('Erro ao enviar sinal de teste');
    } finally {
      setTestingTelegramSignal(false);
    }
  }, [settings?.telegramChatId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        toast.success('Configurações salvas!');
      } else {
        toast.error(json?.error ?? 'Erro ao salvar', { duration: 8000 });
      }
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const togglePair = (pair: string) => {
    const current = settings?.monitoredPairs ?? [];
    const updated = current.includes(pair) ? current.filter((p: string) => p !== pair) : [...current, pair];
    setSettings({ ...(settings ?? {}), monitoredPairs: updated });
  };

  const toggleStrategy = (id: number, field: string) => {
    const current = settings?.[field] ?? [];
    const updated = current.includes(id) ? current.filter((i: number) => i !== id) : [...current, id];
    setSettings({ ...(settings ?? {}), [field]: updated });
  };

  const pairStrategiesFor = (pair: string): number[] => {
    const overrides = settings?.pairStrategies ?? {};
    // Mesmo bug corrigido em lib/pair-strategy-plan.ts (08/09/2026): usar
    // `?.length` aqui tratava "override explícito de zero estratégias"
    // igual a "sem override nenhum" — desmarcar a última estratégia de um
    // par (togglePairStrategy grava `[]`) fazia a tela mostrar tudo
    // marcado de novo, escondendo que o usuário tinha acabado de zerar o
    // par. Agora distingue pela chave existir, não pelo array ter itens.
    return Object.prototype.hasOwnProperty.call(overrides, pair) ? overrides[pair] : (settings?.enabledStrategies ?? [1, 2, 3, 4, 5, 6]);
  };

  const togglePairStrategy = (pair: string, strategyId: number) => {
    const overrides = { ...(settings?.pairStrategies ?? {}) };
    const current = pairStrategiesFor(pair);
    overrides[pair] = current.includes(strategyId) ? current.filter((i: number) => i !== strategyId) : [...current, strategyId];
    setSettings({ ...(settings ?? {}), pairStrategies: overrides });
  };

  const resetPairOverride = (pair: string) => {
    const overrides = { ...(settings?.pairStrategies ?? {}) };
    delete overrides[pair];
    setSettings({ ...(settings ?? {}), pairStrategies: overrides });
  };

  const applyResearchSuggestion = () => {
    const pairs: string[] = settings?.monitoredPairs ?? [];
    const overrides = { ...(settings?.pairStrategies ?? {}) };
    let applied = 0;
    for (const p of pairs) {
      if (RESEARCH_SUGGESTION[p]) {
        overrides[p] = RESEARCH_SUGGESTION[p];
        applied++;
      }
    }
    setSettings({ ...(settings ?? {}), pairStrategies: overrides });
    toast.success(`Sugestão aplicada em ${applied} par(es). Não esquece de clicar em Salvar.`);
  };

  if (!settings) return <div className="text-center py-12 text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-primary" /> Configurações
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Personalize o comportamento do robô</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" /> {saving ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>

      {/* Gestão de Risco */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-display flex items-center gap-2"><Calculator className="w-4 h-4" /> Calculadora de Posição</CardTitle>
          <CardDescription>Só informativo — o robô nunca executa nada sozinho. Preenche aqui pra ver o tamanho sugerido em cada sinal no Dashboard.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="mb-2 block">Capital da conta (USDT)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Ex: 1000"
              value={settings?.accountCapital ?? ''}
              onChange={(e: any) => setSettings({ ...(settings ?? {}), accountCapital: e?.target?.value ? Number(e.target.value) : null })}
            />
            <p className="text-xs text-muted-foreground mt-1">Deixe em branco pra desativar o cálculo.</p>
          </div>
          <div>
            <Label className="mb-2 block">Risco por operação (%)</Label>
            <Input
              type="number"
              min={0.1}
              max={5}
              step="0.1"
              value={settings?.riskPerTradePercent ?? 0.5}
              onChange={(e: any) => setSettings({ ...(settings ?? {}), riskPerTradePercent: Number(e?.target?.value ?? 0.5) })}
            />
            <p className="text-xs text-muted-foreground mt-1">Padrão de mercado: 0,25%–0,75% por operação.</p>
          </div>
        </CardContent>
      </Card>

      {/* Email */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-display flex items-center gap-2"><Mail className="w-4 h-4" /> Alertas por Email</CardTitle>
          <CardDescription>Configure o envio de alertas por email</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Ativar alertas por email</Label>
            <Switch checked={settings?.emailAlerts ?? false} onCheckedChange={(v: boolean) => setSettings({ ...(settings ?? {}), emailAlerts: v })} />
          </div>
          {settings?.emailAlerts && (
            <div className="space-y-2">
              <Label>Email para receber alertas</Label>
              <Input type="email" placeholder="seu@email.com" value={settings?.alertEmail ?? ''} onChange={(e: any) => setSettings({ ...(settings ?? {}), alertEmail: e?.target?.value ?? '' })} />
            </div>
          )}
          {settings?.emailAlerts && (
            <div>
              <Label className="mb-2 block">Estratégias que enviam alertas (novo sinal, alvo e stop)</Label>
              <div className="flex flex-wrap gap-2">
                {STRATEGIES.map((s: any) => (
                  <Badge
                    key={s.id}
                    variant={(settings?.emailStrategies ?? []).includes(s.id) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleStrategy(s.id, 'emailStrategies')}
                  >
                    {s.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Telegram */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-display flex items-center gap-2"><Send className="w-4 h-4" /> Alertas por Telegram</CardTitle>
          <CardDescription>Receba os sinais direto no seu Telegram</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>Ativar alertas por Telegram</Label>
            <Switch checked={settings?.telegramAlerts ?? false} onCheckedChange={(v: boolean) => setSettings({ ...(settings ?? {}), telegramAlerts: v })} />
          </div>

          {settings?.telegramAlerts && (
            <>
              <div className="space-y-2">
                <Label>Chat ID do Telegram</Label>
                <div className="flex gap-2">
                  <Input placeholder="ex: 123456789" value={settings?.telegramChatId ?? ''} onChange={(e: any) => setSettings({ ...(settings ?? {}), telegramChatId: e?.target?.value ?? '' })} />
                  <Button type="button" variant="outline" onClick={findTelegramChats} disabled={searchingChats}>
                    <Search className="w-4 h-4 mr-2" /> {searchingChats ? 'Buscando...' : 'Buscar'}
                  </Button>
                  <Button type="button" variant="outline" onClick={testTelegram} disabled={testingTelegram}>
                    <CheckCircle2 className="w-4 h-4 mr-2" /> {testingTelegram ? 'Enviando...' : 'Testar'}
                  </Button>
                  <Button type="button" variant="outline" onClick={testTelegramSignal} disabled={testingTelegramSignal}>
                    <Send className="w-4 h-4 mr-2" /> {testingTelegramSignal ? 'Enviando...' : 'Testar sinal completo'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Não sabe seu Chat ID? Abra uma conversa com o seu bot no Telegram, mande qualquer
                  mensagem (ex: "oi") e clique em "Buscar" aqui. "Testar" manda uma mensagem simples;
                  "Testar sinal completo" simula um sinal de verdade — use esse se os sinais reais não
                  estiverem chegando, ele passa pelo mesmo caminho de código do robô.
                </p>
              </div>

              {telegramChats.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Conversas encontradas — clique pra usar:</Label>
                  <div className="flex flex-wrap gap-2">
                    {telegramChats.map((c) => (
                      <Badge
                        key={c.chatId}
                        variant={settings?.telegramChatId === c.chatId ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => setSettings({ ...(settings ?? {}), telegramChatId: c.chatId })}
                      >
                        {c.name} ({c.chatId})
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label className="mb-2 block">Estratégias que enviam alertas (novo sinal, alvo e stop)</Label>
                <div className="flex flex-wrap gap-2">
                  {STRATEGIES.map((s: any) => (
                    <Badge
                      key={s.id}
                      variant={(settings?.telegramStrategies ?? []).includes(s.id) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleStrategy(s.id, 'telegramStrategies')}
                    >
                      {s.name}
                    </Badge>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Pares */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-display flex items-center gap-2"><Coins className="w-4 h-4" /> Pares Monitorados</CardTitle>
          <CardDescription>Selecione os pares que deseja monitorar</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ALL_PAIRS.map((pair: string) => (
              <Badge
                key={pair}
                variant={(settings?.monitoredPairs ?? []).includes(pair) ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => togglePair(pair)}
              >
                {pair.replace('USDT', '/USDT')}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Estratégia por Moeda */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-display flex items-center gap-2"><Layers className="w-4 h-4" /> Estratégia por Moeda</CardTitle>
              <CardDescription>Restrinja quais estratégias rodam em cada moeda (opcional)</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={applyResearchSuggestion}>
              <Sparkles className="w-4 h-4 mr-2" /> Aplicar sugestão da pesquisa
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 mb-4">
            Por padrão, toda moeda monitorada roda todas as estratégias marcadas em "Estratégias Ativas" abaixo.
            Aqui você pode restringir moeda por moeda — por exemplo, só rodar "Trap de Liquidez" em BTC. Moedas sem
            nenhuma marcação nesta tabela continuam usando o padrão global. O botão "Aplicar sugestão da pesquisa"
            preenche com uma sugestão baseada em pesquisa de mercado trazida por você — é só um ponto de partida
            editável, vale testar no Backtest antes de confiar.
          </p>
          {(settings?.monitoredPairs?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Selecione pares monitorados acima primeiro.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Moeda</TableHead>
                    {STRATEGIES.map((s) => (
                      <TableHead key={s.id} className="text-center text-xs">{s.short}</TableHead>
                    ))}
                    <TableHead className="text-right text-xs">​</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(settings?.monitoredPairs ?? []).map((pair: string) => {
                    const hasOverride = Object.prototype.hasOwnProperty.call(settings?.pairStrategies ?? {}, pair);
                    const active = pairStrategiesFor(pair);
                    return (
                      <TableRow key={pair}>
                        <TableCell className="font-mono text-xs font-medium">
                          {pair.replace('USDT', '/USDT')}
                          {!hasOverride && <span className="ml-2 text-[10px] text-muted-foreground">(padrão)</span>}
                        </TableCell>
                        {STRATEGIES.map((s) => {
                          const tfRestriction = (settings?.pairStrategyTimeframes ?? {})?.[pair]?.[String(s.id)];
                          return (
                            <TableCell key={s.id} className="text-center">
                              <Checkbox
                                checked={active.includes(s.id)}
                                onCheckedChange={() => togglePairStrategy(pair, s.id)}
                              />
                              {tfRestriction?.length > 0 && (
                                <div className="text-[9px] text-primary mt-0.5">só {tfRestriction.join(', ')}</div>
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right">
                          {hasOverride && (
                            <Button type="button" variant="ghost" size="icon-sm" onClick={() => resetPairOverride(pair)} title="Voltar ao padrão">
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Estratégias */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-display flex items-center gap-2"><Layers className="w-4 h-4" /> Estratégias Ativas</CardTitle>
          <CardDescription>Ative ou desative estratégias individualmente</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {STRATEGIES.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
                <span className="text-sm">{s.name}</span>
                <Switch
                  checked={(settings?.enabledStrategies ?? []).includes(s.id)}
                  onCheckedChange={() => toggleStrategy(s.id, 'enabledStrategies')}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Horários */}
      <Card className="bg-card/80 border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-display flex items-center gap-2"><Clock className="w-4 h-4" /> Horário de Monitoramento</CardTitle>
          <CardDescription>Configure o horário de operação para Day Trade</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Início</Label>
              <Input type="time" value={settings?.dayTradeStart ?? '09:00'} onChange={(e: any) => setSettings({ ...(settings ?? {}), dayTradeStart: e?.target?.value ?? '09:00' })} />
            </div>
            <div className="space-y-2">
              <Label>Fim</Label>
              <Input type="time" value={settings?.dayTradeEnd ?? '18:00'} onChange={(e: any) => setSettings({ ...(settings ?? {}), dayTradeEnd: e?.target?.value ?? '18:00' })} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
