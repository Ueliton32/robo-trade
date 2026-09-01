import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { AppShell } from '@/components/layouts/app-shell';
import { SidebarNav } from '@/components/dashboard/sidebar-nav';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');

  return (
    <AppShell sidebar={<SidebarNav />}>
      <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
        {children}
      </div>
    </AppShell>
  );
}
