"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { AppNotification, CaseReview, SimilarProject } from "@/data/types";

interface ListState {
  query: string;
  statusFilter: string;
  managerFilter: string;
  periodFilter: string;
  starredOnly: boolean;
  viewMode: "list" | "grid";
  page: number;
  /** 검색 모드 — 키워드(정밀검색) vs 공고문(붙여넣기 유사사례). 페이지 이동 후에도 유지 */
  searchMode: "keyword" | "posting";
  /** 공고문 모드에서 붙여넣은 원본 텍스트 */
  postingText: string;
  /** 공고문 유사사례 결과 — 다시 방문했을 때 재검색(비용) 없이 복원하려고 함께 보관 */
  postingResults: SimilarProject[] | null;
}

interface AppContextValue {
  darkMode: boolean;
  toggleDarkMode: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  starred: Record<string, boolean>;
  toggleStar: (id: string) => void;
  notifications: AppNotification[];
  notifRead: Record<string, boolean>;
  markRead: (id: string) => void;
  markAllRead: () => void;
  reviews: Record<string, CaseReview>;
  saveReview: (projectId: string, review: CaseReview) => void;
  slackConnected: boolean;
  toggleSlackConnected: () => void;
  slackChannel: string;
  setSlackChannel: (channel: string) => void;
  toggles: Record<string, boolean>;
  toggle: (key: string) => void;
  listState: ListState;
  setListState: (state: Partial<ListState>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({
  notifications,
  initialReviews,
  children,
}: {
  notifications: AppNotification[];
  initialReviews: Record<string, CaseReview>;
  children: React.ReactNode;
}) {
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [starred, setStarred] = useState<Record<string, boolean>>({ p1: true });
  const [notifRead, setNotifRead] = useState<Record<string, boolean>>({});
  const [reviews, setReviews] = useState(initialReviews);
  const [slackConnected, setSlackConnected] = useState(true);
  const [slackChannel, setSlackChannel] = useState("#caselab-알림");
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    done: true,
    cancel: true,
    digest: false,
    slackStatus: true,
    slackQna: true,
  });
  const [listState, setListStateFull] = useState<ListState>({
    query: "",
    statusFilter: "전체",
    managerFilter: "전체",
    periodFilter: "전체",
    starredOnly: false,
    viewMode: "list",
    page: 1,
    searchMode: "keyword",
    postingText: "",
    postingResults: null,
  });

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
  }, [darkMode]);

  const value: AppContextValue = {
    darkMode,
    toggleDarkMode: () => setDarkMode((v) => !v),
    sidebarCollapsed,
    toggleSidebar: () => setSidebarCollapsed((v) => !v),
    starred,
    toggleStar: (id) => setStarred((s) => ({ ...s, [id]: !s[id] })),
    notifications,
    notifRead,
    markRead: (id) => setNotifRead((r) => ({ ...r, [id]: true })),
    markAllRead: () =>
      setNotifRead(Object.fromEntries(notifications.map((n) => [n.id, true]))),
    reviews,
    saveReview: (projectId, review) =>
      setReviews((r) => ({ ...r, [projectId]: review })),
    slackConnected,
    toggleSlackConnected: () => setSlackConnected((v) => !v),
    slackChannel,
    setSlackChannel,
    toggles,
    toggle: (key) => setToggles((t) => ({ ...t, [key]: !t[key] })),
    listState,
    setListState: (state) => setListStateFull((s) => ({ ...s, ...state })),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
