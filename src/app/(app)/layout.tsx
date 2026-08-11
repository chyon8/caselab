import { cookies } from "next/headers";
import AppShell from "@/components/AppShell";
import { dataSource } from "@/data/source";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { listFavorites } from "@/lib/favorites";
import { AppProvider } from "@/state/AppContext";

// 로그인한 사용자만 도달하는 영역(게이트는 src/proxy.ts).
export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  const [notifications, reviews, starred] = await Promise.all([
    dataSource.getNotifications(),
    dataSource.getReviews(),
    // 마이그레이션 017 적용 전이거나 DB가 없는 환경(mock)에서도 화면은 떠야 한다 — 실패하면 빈 목록
    session ? listFavorites(session.email).catch(() => []) : Promise.resolve([]),
  ]);

  return (
    <AppProvider
      user={session && { name: session.name, email: session.email }}
      notifications={notifications}
      initialReviews={reviews}
      initialStarred={starred}
    >
      <AppShell user={session && { name: session.name, email: session.email }}>
        {children}
      </AppShell>
    </AppProvider>
  );
}
