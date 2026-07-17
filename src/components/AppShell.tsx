"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
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
  const [mobileOpen, setMobileOpen] = useState(false);

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
        <button
          className={styles["hamburger"]}
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="메뉴 열기"
        >
          {mobileOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* ── 모바일 오버레이 메뉴 ── */}
      {mobileOpen && (
        <div className={styles["mobile-overlay"]} onClick={() => setMobileOpen(false)}>
          <nav className={styles["mobile-nav"]} onClick={(e) => e.stopPropagation()}>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => {
                  if (item.href === "/") app.resetFilters();
                  setMobileOpen(false);
                }}
                className={`${styles["mobile-nav-item"]} ${isActive(item.href) ? styles.active : ""}`}
              >
                {item.label}
              </Link>
            ))}
            <button
              className={styles["mobile-theme-btn"]}
              onClick={() => {
                app.toggleDarkMode();
                setMobileOpen(false);
              }}
            >
              <span className={styles["theme-icon"]}>{app.darkMode ? "☀" : "☾"}</span>
              {app.darkMode ? "라이트 모드" : "다크 모드"}
            </button>
          </nav>
        </div>
      )}

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

