import { LpSidebar } from '@/components/dashboard/lp-sidebar';

export const dynamic = 'force-dynamic';

export default function LpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_70%_-10%,hsl(var(--primary)/.07),transparent_30%),hsl(var(--background))]">
      <LpSidebar />
      <main className="min-h-screen lg:pl-[260px]">
        <div className="mx-auto max-w-[1480px] px-4 pb-12 pt-20 sm:px-6 lg:px-8 lg:pt-8">{children}</div>
      </main>
    </div>
  );
}
