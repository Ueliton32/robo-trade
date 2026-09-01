'use client';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { Bot, LayoutDashboard, Layers, BarChart3, Settings, LogOut, Wifi, WifiOff, FlaskConical, Radar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/estrategias', label: 'Estratégias', icon: Layers },
  { href: '/dashboard/estatisticas', label: 'Estatísticas', icon: BarChart3 },
  { href: '/dashboard/backtest', label: 'Backtest', icon: FlaskConical },
  { href: '/dashboard/radar', label: 'Radar', icon: Radar },
  { href: '/dashboard/configuracoes', label: 'Configurações', icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/market-data', { cache: 'no-store' });
        setOnline(res.ok);
      } catch { setOnline(false); }
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 mb-8">
        <Bot className="w-8 h-8 text-primary" />
        <span className="font-display text-xl font-bold tracking-tight">Robô <span className="text-primary">Trade</span></span>
      </div>

      <div className="flex items-center gap-2 px-2 mb-6">
        {online ? (
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <Wifi className="w-3 h-3" />
            <span>Binance conectada</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs text-red-400">
            <WifiOff className="w-3 h-3" />
            <span>Sem conexão</span>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item: any) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith?.(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive ? 'bg-primary/10 text-primary font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}>
                <item.icon className="w-4 h-4" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="pt-4 border-t border-border">
        <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-foreground" onClick={() => signOut({ callbackUrl: '/login' })}>
          <LogOut className="w-4 h-4 mr-3" /> Sair
        </Button>
      </div>
    </div>
  );
}
