"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { AppNotification, CaseReview, ReviewTips, SimilarProject, SimilarStats } from "@/data/types";

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
  /** 공고문 검색 시 내 프로젝트의 업무범위(dev_scope) — 같은 범위 사례를 소프트 부스트. "전체"면 부스트 없음 */
  postingScope: string;
  /** 공고문 유사사례 결과 — 다시 방문했을 때 재검색(비용) 없이 복원하려고 함께 보관 */
  postingResults: SimilarProject[] | null;
  /** 공고문 유사사례 집계 통계 — results와 같은 검색 응답에서 함께 옴 */
  postingStats: SimilarStats | null;
  /** 검수 팁 — 유사 풀의 리스크·질문·키워드를 통합한 것. 같은 검색 응답에서 함께 옴 */
  postingReviewTips: ReviewTips | null;
  /** 검수 팁 생성 실패 사유(quota 초과 등) — 결과·통계는 정상인데 팁만 실패했을 때 채워짐 */
  postingReviewTipsError: string | null;
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
  /** 목록 필터·검색을 기본값으로 완전 초기화 (뷰모드는 유지) */
  resetFilters: () => void;
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
    postingScope: "전체",
    postingResults: null,
    postingStats: null,
    postingReviewTips: null,
    postingReviewTipsError: null,
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
    resetFilters: () =>
      setListStateFull((s) => ({
        ...s,
        query: "",
        statusFilter: "전체",
        managerFilter: "전체",
        periodFilter: "전체",
        starredOnly: false,
        page: 1,
        searchMode: "keyword",
        postingText: "",
        postingScope: "전체",
        postingResults: null,
        postingStats: null,
        postingReviewTips: null,
        postingReviewTipsError: null,
      })),
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
