"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Select from "@/components/Select";
import type { Project } from "@/data/types";
import { onActivate } from "@/lib/a11y";
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
  { value: "김세민", label: "김세민" },
  { value: "장수룡", label: "장수룡" },
  { value: "이상민", label: "이상민" },
];

const PERIOD_OPTIONS = [
  { value: "전체", label: "기간 전체" },
  { value: "오늘", label: "오늘" },
  { value: "1주일", label: "최근 1주일" },
  { value: "1개월", label: "최근 1개월" },
];
import st from "./status.module.css";
import { KANBAN_STATUSES, STATUS_KEY, statusLabel } from "./status";
import styles from "./ProjectList.module.css";

const PERIOD_MAX: Record<string, number> = {
  전체: Infinity,
  오늘: 0,
  "1주일": 7,
  "1개월": 30,
};

export default function ProjectList({ projects }: { projects: Project[] }) {
  const app = useApp();
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("전체");
  const [managerFilter, setManagerFilter] = useState("전체");
  const [periodFilter, setPeriodFilter] = useState("전체");
  const [starredOnly, setStarredOnly] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const q = query.trim();
  const periodMax = PERIOD_MAX[periodFilter] ?? Infinity;

  const matches = (p: Project, withStatus: boolean) => {
    if (q && !(p.name + p.client + p.tech + p.cat).includes(q)) return false;
    if (withStatus && statusFilter !== "전체" && p.status !== statusFilter) return false;
    if (managerFilter !== "전체" && p.manager !== managerFilter) return false;
    if (p.daysAgo > periodMax) return false;
    if (starredOnly && !app.starred[p.id]) return false;
    return true;
  };

  const rows = projects.filter((p) => matches(p, true));

  const kanbanCols = KANBAN_STATUSES.map((stg) => ({
    status: stg,
    items: projects.filter((p) => matches(p, false) && p.status === stg),
  }));

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
            onChange={(e) => setQuery(e.target.value)}
            placeholder="프로젝트명 · 고객사 · 키워드 검색 (예: LLM, 크롤링, 쇼핑몰)"
          />
          <Select
            value={statusFilter}
            options={STATUS_OPTIONS}
            onChange={setStatusFilter}
            ariaLabel="상태 필터"
          />
          <Select
            value={managerFilter}
            options={MANAGER_OPTIONS}
            onChange={setManagerFilter}
            ariaLabel="검수매니저 필터"
          />
          <Select
            value={periodFilter}
            options={PERIOD_OPTIONS}
            onChange={setPeriodFilter}
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
              <div className={`${styles.th} ${styles.right}`}>업데이트</div>
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
                <div className={styles.updated}>{p.updated}</div>
              </div>
            ))}
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
                      — {statusLabel(p.status)} · {p.updated}
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
