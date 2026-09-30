"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { canSeeSubmissionConversion } from "@/lib/auth/allowed-emails";
import { useApp } from "@/state/AppContext";
import styles from "./AppShell.module.css";

// 접힌 사이드바용 아이콘 (lucide 스타일 라인 아이콘, currentColor)
const NAV_ICONS: Record<string, React.ReactNode> = {
  "/": (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </>
  ),
  "/report": (
    <>
      <path d="M3 3v18h18" />
      <path d="M8 17v-5" />
      <path d="M13 17V8" />
      <path d="M18 17v-9" />
    </>
  ),
  "/report/target-demand": (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  "/report/conversion": (
    <>
      <path d="M3 4h18l-7 8v6l-4 2v-8z" />
    </>
  ),
  "/settings": (
    <>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
};

const NAV_ITEMS = [
  { label: "전체 프로젝트", href: "/" },
  { label: "리포트", href: "/report" },
  { label: "수요 리포트", href: "/report/target-demand" },
  // 권한 있는 계정에만 보인다(REPORT_CONVERSION_EMAILS). 페이지도 서버에서 따로 막는다
  { label: "제출 전환", href: "/report/conversion", restricted: true },
  { label: "설정", href: "/settings" },
];

interface SessionUser {
  name: string;
  email: string;
}

export default function AppShell({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  const app = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const sc = app.sidebarCollapsed;

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname.startsWith("/projects")
      : href === "/report"
        ? pathname === href
        : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className={styles.shell}>
      {/* ── 모바일 탑바 ── */}
      <div className={styles["mobile-bar"]}>
        <Link href="/" className={styles["mobile-logo"]} onClick={app.resetFilters}>
          CaseLab
        </Link>
      </div>

      {/* ── 데스크톱 사이드바 ── */}
      <aside className={`${styles.sidebar} ${sc ? styles.collapsed : ""}`}>
        <div className={styles["logo-row"]}>
          <Link href="/" className={styles.logo} onClick={app.resetFilters}>
            {sc ? "C" : "CaseLab"}
          </Link>
          <button
            className={styles["collapse-btn"]}
            onClick={app.toggleSidebar}
            aria-label={sc ? "사이드바 펼치기" : "사이드바 접기"}
          >
            {sc ? "›" : "‹"}
          </button>
        </div>
        {!sc && <div className={styles.subtitle}>프로젝트 케이스 허브</div>}
        {sc && <div className={styles["collapsed-gap"]} />}
        <nav className={styles.nav}>
          {NAV_ITEMS.filter(
            (item) => !item.restricted || canSeeSubmissionConversion(user?.email),
          ).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={item.href === "/" ? app.resetFilters : undefined}
              className={`${styles["nav-item"]} ${isActive(item.href) ? styles.active : ""} ${sc ? styles.centered : ""}`}
              aria-label={sc ? item.label : undefined}
              title={sc ? item.label : undefined}
            >
              {sc ? (
                <svg
                  className={styles["nav-icon"]}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {NAV_ICONS[item.href]}
                </svg>
              ) : (
                item.label
              )}
            </Link>
          ))}
        </nav>

        <button
          className={`${styles["theme-btn"]} ${sc ? styles.centered : ""}`}
          onClick={app.toggleDarkMode}
          aria-label={app.darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
        >
          <span className={styles["theme-icon"]}>{app.darkMode ? "☀" : "☾"}</span>
          {!sc && <span>{app.darkMode ? "라이트 모드" : "다크 모드"}</span>}
        </button>

        {user && (
          <div className={`${styles["user-row"]} ${sc ? styles.centered : ""}`}>
            <div className={styles.avatar}>{user.name.slice(-2)}</div>
            {!sc && (
              <div className={styles["user-meta"]}>
                <div className={styles["user-name"]}>{user.name}</div>
                <div className={styles["user-role"]}>{user.email}</div>
              </div>
            )}
            <button
              className={styles["logout-btn"]}
              onClick={logout}
              aria-label="로그아웃"
              title={sc ? "로그아웃" : undefined}
            >
              {sc ? "⏻" : "로그아웃"}
            </button>
          </div>
        )}
      </aside>

      <div className={styles.main}>
        {children}
      </div>
    </div>
  );
}
