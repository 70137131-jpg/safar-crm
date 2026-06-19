import { requireUser } from "@/lib/auth/session";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell userName={user.name} userRole={user.role}>
      {children}
    </AppShell>
  );
}
