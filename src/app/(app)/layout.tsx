import { cookies } from "next/headers";
import AppShell from "@/components/AppShell";
import { dataSource } from "@/data/source";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { AppProvider } from "@/state/AppContext";

// 로그인한 사용자만 도달하는 영역(게이트는 src/proxy.ts).
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const [session, notifications, reviews] = await Promise.all([
    verifySession(jar.get(SESSION_COOKIE)?.value),
    dataSource.getNotifications(),
    dataSource.getReviews(),
  ]);

  return (
    <AppProvider
      user={session && { name: session.name, email: session.email }}
      notifications={notifications}
      initialReviews={reviews}
    >
      <AppShell user={session && { name: session.name, email: session.email }}>
        {children}
      </AppShell>
    </AppProvider>
  );
}
