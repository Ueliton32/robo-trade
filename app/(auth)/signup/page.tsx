'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Bot, UserPlus, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function SignupPage() {
  const [name, setName] = useState('');
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
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? 'Erro ao criar conta');
        return;
      }
      const loginRes = await signIn('credentials', { email, password, redirect: false });
      if (loginRes?.error) {
        setError('Conta criada, mas falha ao login automático.');
      } else {
        router.replace('/dashboard');
      }
    } catch {
      setError('Erro ao criar conta');
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
          <p className="text-muted-foreground">Crie sua conta para começar</p>
        </div>
        <Card className="bg-card/80 border-border/50">
          <CardHeader>
            <CardTitle className="font-display">Criar Conta</CardTitle>
            <CardDescription>Preencha seus dados abaixo</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4" /> {error}
                </div>
              )}
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input placeholder="Seu nome" value={name} onChange={(e: any) => setName(e?.target?.value ?? '')} required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" placeholder="seu@email.com" value={email} onChange={(e: any) => setEmail(e?.target?.value ?? '')} required />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input type="password" placeholder="Min. 6 caracteres" value={password} onChange={(e: any) => setPassword(e?.target?.value ?? '')} required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Criando...' : <><UserPlus className="w-4 h-4 mr-2" /> Criar Conta</>}
              </Button>
            </form>
            <p className="text-center text-sm text-muted-foreground mt-4">
              Já tem conta?{' '}
              <Link href="/login" className="text-primary hover:underline">Entrar</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
