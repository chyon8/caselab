"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/state/AppContext";
import styles from "./AppShell.module.css";

const NAV_ITEMS = [
  { label: "전체 프로젝트", href: "/" },
  { label: "리포트", href: "/report" },
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
      : pathname === href;

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
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={item.href === "/" ? app.resetFilters : undefined}
              className={`${styles["nav-item"]} ${isActive(item.href) ? styles.active : ""} ${sc ? styles.centered : ""}`}
              aria-label={sc ? item.label : undefined}
            >
              {sc ? item.label.charAt(0) : item.label}
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

