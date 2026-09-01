'use client';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatPrice } from '@/lib/utils';

interface MarketData {
  symbol: string;
  price: number;
  priceChange: number;
  volume24h: number;
  fundingRate: number;
  openInterest: number;
}

export function MarketCard({ data }: { data: MarketData }) {
  const isUp = (data?.priceChange ?? 0) >= 0;
  const pairName = (data?.symbol ?? '').replace('USDT', '/USDT');

  const formatNum = (n: number) => {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
    return `$${n?.toFixed?.(2) ?? '0.00'}`;
  };

  return (
    <Card className="bg-card/80 border-border/50 hover:border-primary/30 transition-all duration-300">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="font-display font-bold text-base">{pairName}</span>
          <div className={`flex items-center gap-1 text-sm font-mono ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
            {isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {isUp ? '+' : ''}{(data?.priceChange ?? 0)?.toFixed?.(2) ?? '0.00'}%
          </div>
        </div>
        <p className="font-mono text-xl font-bold mb-3">{formatPrice(data?.price ?? 0)}</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>
            <span className="block opacity-60">Vol 24h</span>
            <span className="font-mono">{formatNum(data?.volume24h ?? 0)}</span>
          </div>
          <div>
            <span className="block opacity-60">Funding</span>
            <span className={`font-mono ${(data?.fundingRate ?? 0) > 0.0005 ? 'text-red-400' : (data?.fundingRate ?? 0) < -0.0002 ? 'text-emerald-400' : ''}`}>
              {((data?.fundingRate ?? 0) * 100)?.toFixed?.(4) ?? '0.0000'}%
            </span>
          </div>
          <div className="col-span-2">
            <span className="block opacity-60">Open Interest</span>
            <span className="font-mono flex items-center gap-1">
              <Activity className="w-3 h-3" />
              {formatNum(data?.openInterest ?? 0)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}