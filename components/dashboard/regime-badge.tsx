'use client';

import { Badge } from '@/components/ui/badge';
import { MarketRegime, regimeToBadge } from '@/types/dashboard';

interface RegimeBadgeProps {
  label: string;
  regime: MarketRegime | null;
  size?: 'sm' | 'md' | 'lg';
}

export function RegimeBadge({ label, regime, size = 'md' }: RegimeBadgeProps) {
  const badgeColor = regime ? regimeToBadge(regime.state) : 'YELLOW';
  const colorClasses = {
    GREEN: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    YELLOW: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    RED: 'bg-red-500/10 text-red-400 border-red-500/30',
  };

  const sizeClasses = {
    sm: 'text-[10px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <Badge 
        variant="outline" 
        className={`${colorClasses[badgeColor]} ${sizeClasses[size]} font-medium`}
      >
        {regime?.state || 'UNKNOWN'} {regime && `${Math.round(regime.confidence)}%`}
      </Badge>
      {regime && (
        <div className="text-[10px] text-muted-foreground">
          {new Date(regime.timestamp || 0).toLocaleTimeString('pt-BR')}
        </div>
      )}
    </div>
  );
}
