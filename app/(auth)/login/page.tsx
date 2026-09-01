'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Bot, LogIn, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await signIn('credentials', { email, password, redirect: false });
      if (res?.error) {
        setError('Email ou senha inválidos');
      } else {
        router.replace('/dashboard');
      }
    } catch {
      setError('Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <Bot className="w-10 h-10 text-primary" />
            <span className="font-display text-3xl font-bold tracking-tight">Robô <span className="text-primary">Trade</span></span>
          </div>
          <p className="text-muted-foreground">Sinais de trading multi-estratégia</p>
        </div>
        <Card className="bg-card/80 border-border/50">
          <CardHeader>
            <CardTitle className="font-display">Entrar</CardTitle>
            <CardDescription>Acesse seu painel de trading</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="seu@email.com" value={email} onChange={(e: any) => setEmail(e?.target?.value ?? '')} required />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input type="password" placeholder="********" value={password} onChange={(e: any) => setPassword(e?.target?.value ?? '')} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Entrando...' : <><LogIn className="w-4 h-4 mr-2" /> Entrar</>}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              Não tem conta?{' '}
              <Link href="/signup" className="text-primary hover:underline">Criar conta</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
