"use client";

import type { CSSProperties } from "react";
import type { Project } from "@/data/types";
import { useApp } from "@/state/AppContext";
import styles from "./Report.module.css";

export default function Report({ projects }: { projects: Project[] }) {
  const app = useApp();

  const counts: Record<string, number> = {};
  projects.forEach((p) => {
    p.riskTags.forEach((t) => {
      counts[t] = (counts[t] || 0) + 1;
    });
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 1;

  const doneCnt = projects.filter((p) => p.status === "완료(성공)").length;
  const cancelCnt = projects.filter((p) => p.status === "완료(취소)").length;
  const reviewedCnt = Object.keys(app.reviews).length;

  const statCards = [
    {
      value: doneCnt + cancelCnt,
      label: `축적된 완료 케이스 (성공 ${doneCnt} · 취소 ${cancelCnt})`,
    },
    { value: reviewedCnt, label: "리뷰 작성 완료" },
    {
      value: doneCnt + cancelCnt - reviewedCnt,
      label: "리뷰 대기 — 검수 컨설턴트 알림 발송됨",
    },
  ];

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>리포트</h1>

      <div className={styles["section-head"]}>
        <span className={styles["section-title"]}>리스크 카테고리별 발생 빈도</span>
      </div>
      <div className={styles.bars}>
        {entries.map(([label, count]) => (
          <div key={label} className={styles["bar-row"]}>
            <div className={styles["bar-label"]}>{label}</div>
            <div className={styles["bar-track"]}>
              <div
                className={styles["bar-fill"]}
                style={
                  { "--bar-width": `${Math.round((count / max) * 100)}%` } as CSSProperties
                }
              />
            </div>
            <div className={styles["bar-count"]}>{count}</div>
          </div>
        ))}
      </div>

      <div className={styles["section-head"]}>
        <span className={styles["section-title"]}>케이스 축적 현황</span>
      </div>
      <div className={styles["stat-grid"]}>
        {statCards.map((s) => (
          <div key={s.label} className={styles["stat-card"]}>
            <div className={styles["stat-value"]}>{s.value}</div>
            <div className={styles["stat-label"]}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
