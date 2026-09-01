import { getExchangeInfo, getAll24hTickers } from './binance';

export interface UniversePair {
  symbol: string;
  quoteVolume: number;
  priceChangePercent: number;
}

const MAX_UNIVERSE_SIZE = 100;

/**
 * Monta o universo do radar: todos os contratos perpétuos USDT-M em
 * negociação na Binance Futures, ranqueados por volume em USDT nas
 * últimas 24h, cortado em até 100. Isso é dinâmico — muda sozinho
 * conforme o volume de mercado muda — diferente da lista fixa de 21
 * pares curados manualmente que o app já usa pra sinais validados.
 *
 * Volume alto é, por si só, um proxy barato de liquidez — é o primeiro
 * filtro de qualidade do documento do usuário ("não rastrear centenas de
 * altcoins ruins"), antes de qualquer indicador entrar em cena.
 */
export async function getRadarUniverse(maxSize: number = MAX_UNIVERSE_SIZE): Promise<UniversePair[]> {
  const [exchangeInfo, tickers] = await Promise.all([getExchangeInfo(), getAll24hTickers()]);

  const validSymbols = new Set(
    exchangeInfo
      .filter((s) => s.status === 'TRADING' && s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT')
      .map((s) => s.symbol)
  );

  const pairs: UniversePair[] = tickers
    .filter((t) => validSymbols.has(t.symbol))
    .map((t) => ({
      symbol: t.symbol,
      quoteVolume: parseFloat(t.quoteVolume ?? '0'),
      priceChangePercent: parseFloat(t.priceChangePercent ?? '0'),
    }))
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, maxSize);

  return pairs;
}
