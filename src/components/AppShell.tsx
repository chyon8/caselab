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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const sc = app.sidebarCollapsed;

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname.startsWith("/projects")
      : pathname === href;

  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${sc ? styles.collapsed : ""}`}>
        <div className={styles["logo-row"]}>
          <Link href="/" className={styles.logo}>
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

        <div className={`${styles["user-row"]} ${sc ? styles.centered : ""}`}>
          <div className={styles.avatar}>세민</div>
          {!sc && (
            <div>
              <div className={styles["user-name"]}>김세민</div>
              <div className={styles["user-role"]}>검수 컨설턴트</div>
            </div>
          )}
        </div>
      </aside>

      <div className={styles.main}>
        {children}
      </div>
    </div>
  );
}
