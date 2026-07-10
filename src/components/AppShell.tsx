"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const [notifOpen, setNotifOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const sc = app.sidebarCollapsed;
  const unreadCount = app.notifications.filter((n) => !app.notifRead[n.id]).length;

  // 알림 드롭다운: 바깥 클릭 시 닫기
  useEffect(() => {
    if (!notifOpen) return;
    const onDown = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notifOpen]);

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/" || pathname.startsWith("/projects")
      : pathname === href;

  const openNotif = (id: string, projectId: string) => {
    app.markRead(id);
    setNotifOpen(false);
    router.push(`/projects/${projectId}`);
  };

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
        <div className={styles["bell-wrap"]} ref={bellRef}>
          <button
            className={styles["bell-btn"]}
            onClick={() => setNotifOpen((v) => !v)}
            aria-label="알림"
            aria-expanded={notifOpen}
          >
            <svg
              className={styles["bell-icon"]}
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {unreadCount > 0 && (
              <div className={styles.badge}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </div>
            )}
          </button>
          {notifOpen && (
            <div className={styles.dropdown}>
              <div className={styles["dd-header"]}>
                <div className={styles["dd-title"]}>알림</div>
                <div className={styles["dd-actions"]}>
                  <button className={styles["mark-all"]} onClick={app.markAllRead}>
                    모두 읽음
                  </button>
                  <button
                    className={styles["dd-close"]}
                    onClick={() => setNotifOpen(false)}
                    aria-label="알림 닫기"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className={styles["dd-list"]}>
                {app.notifications.map((n) => {
                  const unread = !app.notifRead[n.id];
                  return (
                    <button
                      key={n.id}
                      className={`${styles["notif-row"]} ${unread ? styles.unread : ""}`}
                      onClick={() => openNotif(n.id, n.projectId)}
                    >
                      <div
                        className={`${styles["notif-dot"]} ${n.type === "qna" ? styles.qna : ""}`}
                      />
                      <div className={styles["notif-body"]}>
                        <div
                          className={`${styles["notif-text"]} ${unread ? styles.unread : ""}`}
                        >
                          {n.text}
                        </div>
                        <div className={styles["notif-time"]}>{n.time}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
