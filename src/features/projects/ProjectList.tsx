"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Select from "@/components/Select";
import type { Project } from "@/data/types";
import { onActivate } from "@/lib/a11y";
import { matchesManager, OTHER_MANAGERS, PRIMARY_MANAGERS } from "@/lib/managers";
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

/** 한 페이지에 보여줄 건수 */
const PAGE_SIZE = 50;
/** 한 번에 보여줄 페이지 번호 개수 */
const PAGE_BLOCK = 10;
/** 칸반 컬럼당 렌더링할 카드 수 — 전부 그리면 카드 수천 개가 DOM에 쌓인다 */
const KANBAN_PAGE = 30;

/** 기준은 검수 시작일(date_submitted)이다 — 본진 최종 수정일이 아니다 */
const PERIOD_OPTIONS = [
  { value: "전체", label: "검수 기간 전체" },
  { value: "오늘", label: "오늘 접수된 건" },
  { value: "1주일", label: "검수 최근 1주일" },
  { value: "1개월", label: "검수 최근 1개월" },
  { value: "3개월", label: "검수 최근 3개월" },
  { value: "6개월", label: "검수 최근 6개월" },
  { value: "1년", label: "검수 최근 1년" },
  { value: "2년", label: "검수 최근 2년" },
  { value: "3년", label: "검수 최근 3년" },
  { value: "5년", label: "검수 최근 5년" },
];
import st from "./status.module.css";
import { KANBAN_STATUSES, STATUS_KEY, statusLabel } from "./status";
import styles from "./ProjectList.module.css";

const PERIOD_MAX: Record<string, number> = {
  전체: Infinity,
  "오늘": 0,
  "1주일": 7,
  "1개월": 30,
  "3개월": 90,
  "6개월": 180,
  "1년": 365,
  "2년": 730,
  "3년": 1095,
  "5년": 1825,
};

export default function ProjectList({ projects }: { projects: Project[] }) {
  const app = useApp();
  const router = useRouter();

  const {
    query,
    statusFilter,
    managerFilter,
    periodFilter,
    starredOnly,
    viewMode,
    page,
    kanbanShown,
  } = app.listState;

  const setQuery = (v: string) => app.setListState({ query: v });
  const setStatusFilter = (v: string) => app.setListState({ statusFilter: v });
  const setManagerFilter = (v: string) => app.setListState({ managerFilter: v });
  const setPeriodFilter = (v: string) => app.setListState({ periodFilter: v });
  const setStarredOnly = (v: boolean | ((prev: boolean) => boolean)) =>
    app.setListState({
      starredOnly: typeof v === "function" ? v(starredOnly) : v,
    });
  const setViewMode = (v: "list" | "grid") => app.setListState({ viewMode: v });
  const setPage = (v: number) => app.setListState({ page: v });
  const setKanbanShown = (
    v:
      | Record<string, number>
      | ((prev: Record<string, number>) => Record<string, number>)
  ) =>
    app.setListState({
      kanbanShown: typeof v === "function" ? v(kanbanShown) : v,
    });

  const q = query.trim();
  const periodMax = PERIOD_MAX[periodFilter] ?? Infinity;

  /** 필터가 바뀌면 1페이지로 — 3페이지 보던 중 필터를 좁히면 빈 화면이 뜬다 */
  const withReset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  const matches = (p: Project, withStatus: boolean) => {
    if (q && !(p.name + p.client + p.tech + p.cat).includes(q)) return false;
    if (withStatus && statusFilter !== "전체" && p.status !== statusFilter) return false;
    if (!matchesManager(p.manager, managerFilter)) return false;
    // 검수 시작 기준. 검수 기록이 없는 건은 기간을 좁히면 빠진다 (판단 근거가 없으므로)
    if (periodMax !== Infinity && (p.submittedDaysAgo == null || p.submittedDaysAgo > periodMax)) {
      return false;
    }
    if (starredOnly && !app.starred[p.id]) return false;
    return true;
  };

  const rows = projects.filter((p) => matches(p, true));

  // 페이지가 범위를 벗어나면(필터로 건수가 줄면) 마지막 페이지로 당긴다
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // 페이지 번호는 10개씩 묶어서 보여준다 (1~10, 11~20 …)
  const blockStart = Math.floor((currentPage - 1) / PAGE_BLOCK) * PAGE_BLOCK + 1;
  const blockEnd = Math.min(blockStart + PAGE_BLOCK - 1, totalPages);
  const pageNumbers = Array.from(
    { length: blockEnd - blockStart + 1 },
    (_, i) => blockStart + i,
  );

  const kanbanCols = KANBAN_STATUSES.map((stg) => ({
    status: stg,
    items: projects.filter((p) => matches(p, false) && p.status === stg),
  }));

  const shownOf = (status: string) => kanbanShown[status] ?? KANBAN_PAGE;
  const showMore = (status: string) =>
    setKanbanShown((m) => ({ ...m, [status]: shownOf(status) + KANBAN_PAGE }));

  // AI 유사사례 제안: 검색어가 있을 때 같은 카테고리의 완료 사례를 추천
  let aiRows: { project: Project; sim: "high" | "mid" }[] = [];
  if (q) {
    const catHit = projects.find(
      (p) => p.cat.includes(q) || p.tech.includes(q) || p.name.includes(q)
    );
    if (catHit) {
      let similar = projects.filter(
        (p) => p.cat === catHit.cat && p.status.startsWith("완료") && p.id !== catHit.id
      );
      if (!similar.length)
        similar = projects.filter((p) => p.status === "완료(성공)").slice(0, 2);
      aiRows = similar
        .slice(0, 3)
        .map((p, i) => ({ project: p, sim: i === 0 ? "high" : "mid" }));
    }
  }

  const open = (id: string) => router.push(`/projects/${id}`);

  const toggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    app.toggleStar(id);
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles["header-row"]}>
          <div className={styles["title-group"]}>
            <h1 className={styles.title}>전체 프로젝트</h1>
            <div className={styles.count}>{rows.length}건</div>
          </div>
          <div className={styles.controls}>
            <div
              className={`${styles["star-filter"]} ${starredOnly ? styles.active : ""}`}
              onClick={() => setStarredOnly((v) => !v)}
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
            placeholder="프로젝트명 · 고객사 · 키워드 검색 (예: LLM, 크롤링, 쇼핑몰)"
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
              <div className={`${styles.th} ${styles.right}`}>검수시작</div>
            </div>
            {pageRows.map((p) => (
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
                <div className={styles.updated}>{p.submittedAt}</div>
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
                  {rows.length.toLocaleString()}건 · {currentPage} / {totalPages}
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
                  <div className={styles["kcol-count"]}>{col.items.length}</div>
                </div>
                <div className={styles["kcol-list"]}>
                  {col.items.slice(0, shownOf(col.status)).map((p) => (
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
                  {col.items.length > shownOf(col.status) && (
                    <button
                      className={styles["kcol-more"]}
                      onClick={() => showMore(col.status)}
                    >
                      {(col.items.length - shownOf(col.status)).toLocaleString()}건 더 보기
                    </button>
                  )}
                  {col.items.length === 0 && (
                    <div className={styles["kcol-empty"]}>없음</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {viewMode === "list" && rows.length === 0 && (
          <div className={styles.empty}>조건에 맞는 프로젝트가 없습니다.</div>
        )}

        {aiRows.length > 0 && (
          <div className={styles["ai-panel"]}>
            <div className={styles["ai-head"]}>
              <span className={styles["ai-chip"]}>AI 유사사례 제안</span>
              <span className={styles["ai-sub"]}>
                키워드 검색과 별도로 AI가 추가 제안합니다
              </span>
            </div>
            <div className={styles["ai-list"]}>
              {aiRows.map(({ project: p, sim }) => (
                <div
                  key={p.id}
                  className={styles["ai-row"]}
                  onClick={() => open(p.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={onActivate(() => open(p.id))}
                >
                  <div className={styles["ai-name"]}>
                    <b>{p.name}</b>
                    <span className={styles["ai-meta"]}>
                      {" "}
                      — {statusLabel(p.status)} · {p.submittedAt}
                    </span>
                  </div>
                  <span className={`${styles.sim} ${sim === "high" ? styles.high : styles.mid}`}>
                    {sim === "high" ? "유사도 높음" : "유사도 중간"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
