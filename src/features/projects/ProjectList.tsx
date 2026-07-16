"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Select from "@/components/Select";
import type { KanbanColumn, ProjectPage } from "@/data/types";
import { onActivate } from "@/lib/a11y";
import { OTHER_MANAGERS, PRIMARY_MANAGERS } from "@/lib/managers";
import { useApp } from "@/state/AppContext";

const STATUS_OPTIONS = [
  { value: "전체", label: "상태 전체" },
  { value: "검수", label: "검수" },
  { value: "모집", label: "모집" },
  { value: "계약", label: "계약" },
  { value: "진행", label: "프로젝트 진행" },
  { value: "완료(성공)", label: "완료(성공)" },
  { value: "완료(취소)", label: "완료(취소)" },
];

const MANAGER_OPTIONS = [
  { value: "전체", label: "검수매니저 전체" },
  ...PRIMARY_MANAGERS.map((m) => ({ value: m, label: m })),
  { value: OTHER_MANAGERS, label: OTHER_MANAGERS },
];

/** 한 번에 보여줄 페이지 번호 개수 */
const PAGE_BLOCK = 10;
/** 칸반 컬럼당 한 번에 더 불러올 카드 수 (서버 KANBAN_PAGE_SIZE와 같아야 한다) */
const KANBAN_PAGE = 30;

/**
 * 기준은 **검수 완료일**(매니저가 모집으로 넘긴 날, date_start_recruitment)이다.
 * 첫 화면의 목적이 "오늘 뭐 검수했지?"라서 정렬·표시·필터를 전부 이 날짜로 통일했다.
 */
const PERIOD_OPTIONS = [
  { value: "오늘", label: "오늘 검수" },
  { value: "1주일", label: "최근 1주일" },
  { value: "1개월", label: "최근 1개월" },
  { value: "3개월", label: "최근 3개월" },
  { value: "6개월", label: "최근 6개월" },
  { value: "1년", label: "최근 1년" },
  { value: "전체", label: "기간 전체" },
];
import st from "./status.module.css";
import { KANBAN_STATUSES, STATUS_KEY, statusLabel } from "./status";
import styles from "./ProjectList.module.css";

/** 기간 라벨 → 최근 N일. 전체는 서버에 "전체"로 보낸다 */
const PERIOD_DAYS: Record<string, number | "전체"> = {
  전체: "전체",
  오늘: 0,
  "1주일": 7,
  "1개월": 30,
  "3개월": 90,
  "6개월": 180,
  "1년": 365,
};

export default function ProjectList({
  initial,
  pageSize,
}: {
  initial: ProjectPage;
  pageSize: number;
}) {
  const app = useApp();
  const router = useRouter();

  const { query, statusFilter, managerFilter, periodFilter, starredOnly, viewMode, page } =
    app.listState;

  const setQuery = (v: string) => app.setListState({ query: v });
  const setStatusFilter = (v: string) => app.setListState({ statusFilter: v });
  const setManagerFilter = (v: string) => app.setListState({ managerFilter: v });
  const setPeriodFilter = (v: string) => app.setListState({ periodFilter: v });
  const setStarredOnly = (v: boolean | ((prev: boolean) => boolean)) =>
    app.setListState({ starredOnly: typeof v === "function" ? v(starredOnly) : v });
  const setViewMode = (v: "list" | "grid") => app.setListState({ viewMode: v });
  const setPage = (v: number) => app.setListState({ page: v });

  const q = query.trim();

  /** 필터가 바뀌면 1페이지로 — 3페이지 보던 중 필터를 좁히면 빈 화면이 뜬다 */
  const withReset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  // ★관심 필터가 켜졌을 때만 관심 id 목록을 서버로 보낸다. off면 파라미터 자체를 안 보낸다.
  const starredIds = starredOnly
    ? Object.keys(app.starred).filter((id) => app.starred[id])
    : null;
  const starredKey = starredIds ? starredIds.join(",") : "off";

  /** 목록·칸반이 공유하는 필터 파라미터(상태·페이지 제외) */
  const commonParams = () => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (managerFilter !== "전체") sp.set("manager", managerFilter);
    sp.set("period", String(PERIOD_DAYS[periodFilter] ?? "전체"));
    if (starredIds) sp.set("starred", starredIds.join(","));
    return sp;
  };

  // ── 리스트 데이터 (서버 페이지네이션) ──────────────────────────────
  const [listData, setListData] = useState<ProjectPage>(initial);
  const [listLoading, setListLoading] = useState(false);

  useEffect(() => {
    if (viewMode !== "list") return;
    const ctrl = new AbortController();
    setListLoading(true);
    const timer = setTimeout(async () => {
      try {
        const sp = commonParams();
        if (statusFilter !== "전체") sp.set("status", statusFilter);
        sp.set("page", String(page));
        sp.set("pageSize", String(pageSize));
        const res = await fetch(`/api/projects?${sp}`, { signal: ctrl.signal });
        setListData((await res.json()) as ProjectPage);
        setListLoading(false);
      } catch {
        if (!ctrl.signal.aborted) setListLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, statusFilter, managerFilter, periodFilter, starredKey, page, viewMode, pageSize]);

  // ── 칸반 데이터 (상태 드롭다운·페이지 무시) ─────────────────────────
  const [kanban, setKanban] = useState<KanbanColumn[] | null>(null);
  const [kanbanLoading, setKanbanLoading] = useState(false);

  useEffect(() => {
    if (viewMode !== "grid") return;
    const ctrl = new AbortController();
    setKanbanLoading(true);
    const timer = setTimeout(async () => {
      try {
        const sp = commonParams();
        sp.set("mode", "kanban");
        const res = await fetch(`/api/projects?${sp}`, { signal: ctrl.signal });
        const data = (await res.json()) as { columns: KanbanColumn[] };
        setKanban(data.columns);
        setKanbanLoading(false);
      } catch {
        if (!ctrl.signal.aborted) setKanbanLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, managerFilter, periodFilter, starredKey, viewMode]);

  /** 칸반 "더 보기" — 그 컬럼의 다음 페이지를 받아 이어붙인다 */
  const loadMore = async (status: string) => {
    const col = kanban?.find((c) => c.status === status);
    if (!col) return;
    const nextPage = Math.floor(col.items.length / KANBAN_PAGE) + 1;
    const sp = commonParams();
    sp.set("status", status);
    sp.set("page", String(nextPage));
    sp.set("pageSize", String(KANBAN_PAGE));
    const res = await fetch(`/api/projects?${sp}`);
    const data = (await res.json()) as ProjectPage;
    setKanban(
      (cols) =>
        cols?.map((c) =>
          c.status === status ? { ...c, items: [...c.items, ...data.rows] } : c,
        ) ?? null,
    );
  };

  // 페이지네이션 (서버 total 기준)
  const rows = listData.rows;
  const total = listData.total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const blockStart = Math.floor((currentPage - 1) / PAGE_BLOCK) * PAGE_BLOCK + 1;
  const blockEnd = Math.min(blockStart + PAGE_BLOCK - 1, totalPages);
  const pageNumbers = Array.from(
    { length: blockEnd - blockStart + 1 },
    (_, i) => blockStart + i,
  );

  const open = (id: string) => router.push(`/projects/${id}`);

  const toggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    app.toggleStar(id);
  };

  const kanbanCols = kanban ?? KANBAN_STATUSES.map((s) => ({ status: s, total: 0, items: [] }));

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles["header-row"]}>
          <div className={styles["title-group"]}>
            <h1 className={styles.title}>전체 프로젝트</h1>
            <div className={styles.count}>
              {viewMode === "list" ? `${total.toLocaleString()}건` : ""}
              {listLoading && viewMode === "list" ? " · 검색 중…" : ""}
            </div>
          </div>
          <div className={styles.controls}>
            <div
              className={`${styles["star-filter"]} ${starredOnly ? styles.active : ""}`}
              onClick={() => {
                setStarredOnly((v) => !v);
                setPage(1);
              }}
            >
              ★ 관심
            </div>
            <div className={styles["seg-group"]}>
              <div
                className={`${styles.seg} ${viewMode === "list" ? styles.active : ""}`}
                onClick={() => setViewMode("list")}
              >
                ☰ 리스트
              </div>
              <div
                className={`${styles.seg} ${viewMode === "grid" ? styles.active : ""}`}
                onClick={() => setViewMode("grid")}
              >
                ▦ 칸반
              </div>
            </div>
          </div>
        </div>

        <div className={styles.filters}>
          <input
            className={styles.search}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="프로젝트명 · 고객사 · 공고 본문 · 키워드 검색 (예: LLM, 크롤링, 쇼핑몰)"
          />
          <Select
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={withReset(setStatusFilter)}
            ariaLabel="상태 필터"
          />
          <Select
            value={managerFilter}
            options={MANAGER_OPTIONS}
            onChange={withReset(setManagerFilter)}
            ariaLabel="검수매니저 필터"
          />
          <Select
            value={periodFilter}
            options={PERIOD_OPTIONS}
            onChange={withReset(setPeriodFilter)}
            ariaLabel="기간 필터"
          />
        </div>

        {viewMode === "list" && (
          <>
            <div className={styles["table-head"]}>
              <div />
              <div className={styles.th}>프로젝트명</div>
              <div className={styles.th}>고객사</div>
              <div className={styles.th}>상태</div>
              <div className={styles.th}>검수담당</div>
              <div className={`${styles.th} ${styles.right}`}>가격</div>
              <div className={`${styles.th} ${styles.right}`}>검수완료</div>
            </div>
            {rows.map((p) => (
              <div
                key={p.id}
                className={styles.row}
                onClick={() => open(p.id)}
                role="button"
                tabIndex={0}
                onKeyDown={onActivate(() => open(p.id))}
              >
                <button
                  className={`${styles.star} ${app.starred[p.id] ? styles.on : ""}`}
                  onClick={(e) => toggleStar(e, p.id)}
                  aria-label={app.starred[p.id] ? "관심 해제" : "관심 등록"}
                >
                  {app.starred[p.id] ? "★" : "☆"}
                </button>
                <div className={styles.name}>{p.name}</div>
                <div className={styles.client}>{p.client}</div>
                <div>
                  <span className={`${st.chip} ${st[STATUS_KEY[p.status]]}`}>
                    {statusLabel(p.status)}
                  </span>
                </div>
                <div className={styles.manager}>{p.manager}</div>
                <div className={styles.price}>
                  <div className={styles["price-budget"]}>{p.budget}</div>
                  {p.contractAmount && (
                    <div className={styles["price-contract"]}>계약 {p.contractAmount}</div>
                  )}
                </div>
                <div className={styles.updated}>{p.reviewedAt}</div>
              </div>
            ))}

            {totalPages > 1 && (
              <div className={styles.pagination}>
                <button
                  className={styles["page-btn"]}
                  onClick={() => setPage(1)}
                  disabled={currentPage === 1}
                  aria-label="첫 페이지"
                >
                  ««
                </button>
                <button
                  className={styles["page-btn"]}
                  onClick={() => setPage(blockStart - 1)}
                  disabled={blockStart === 1}
                  aria-label="이전 10페이지"
                >
                  ‹
                </button>

                {pageNumbers.map((n) => (
                  <button
                    key={n}
                    className={`${styles["page-btn"]} ${n === currentPage ? styles["page-btn-active"] : ""}`}
                    onClick={() => setPage(n)}
                    aria-current={n === currentPage ? "page" : undefined}
                  >
                    {n}
                  </button>
                ))}

                <button
                  className={styles["page-btn"]}
                  onClick={() => setPage(blockEnd + 1)}
                  disabled={blockEnd === totalPages}
                  aria-label="다음 10페이지"
                >
                  ›
                </button>
                <button
                  className={styles["page-btn"]}
                  onClick={() => setPage(totalPages)}
                  disabled={currentPage === totalPages}
                  aria-label="마지막 페이지"
                >
                  »»
                </button>

                <span className={styles["page-info"]}>
                  {total.toLocaleString()}건 · {currentPage} / {totalPages}
                </span>
              </div>
            )}
          </>
        )}

        {viewMode === "grid" && (
          <div className={styles.kanban}>
            {kanbanCols.map((col) => (
              <div key={col.status} className={styles.kcol}>
                <div className={styles["kcol-head"]}>
                  <div className={`${st.dot} ${st[STATUS_KEY[col.status]]}`} />
                  <div className={styles["kcol-title"]}>{statusLabel(col.status)}</div>
                  <div className={styles["kcol-count"]}>{col.total}</div>
                </div>
                <div className={styles["kcol-list"]}>
                  {col.items.map((p) => (
                    <div
                      key={p.id}
                      className={styles.kcard}
                      onClick={() => open(p.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={onActivate(() => open(p.id))}
                    >
                      <div className={styles["kcard-top"]}>
                        <div className={styles["kcard-name"]}>{p.name}</div>
                        <button
                          className={`${styles["kcard-star"]} ${app.starred[p.id] ? styles.on : ""}`}
                          onClick={(e) => toggleStar(e, p.id)}
                          aria-label={app.starred[p.id] ? "관심 해제" : "관심 등록"}
                        >
                          {app.starred[p.id] ? "★" : "☆"}
                        </button>
                      </div>
                      <div className={styles["kcard-meta"]}>
                        {p.client} · {p.manager}
                      </div>
                    </div>
                  ))}
                  {col.total > col.items.length && (
                    <button
                      className={styles["kcol-more"]}
                      onClick={() => loadMore(col.status)}
                    >
                      {(col.total - col.items.length).toLocaleString()}건 더 보기
                    </button>
                  )}
                  {col.total === 0 && !kanbanLoading && (
                    <div className={styles["kcol-empty"]}>없음</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === "list" && !listLoading && rows.length === 0 && (
          <div className={styles.empty}>조건에 맞는 프로젝트가 없습니다.</div>
        )}
      </div>
    </div>
  );
}
