"use client";

import type { SimilarStats } from "@/data/types";
import styles from "./SimilarStatsPanel.module.css";

/** 표본이 이보다 적으면 아예 안 띄운다 — 몇 건 안 되는 유사사례로 통계를 내는 건 무의미하다 */
const MIN_POOL = 5;

/** 분포에서 가장 비중이 큰 한 줄만 뽑는다 */
function top<T extends { rate: number }>(rows: T[]): T | undefined {
  return rows.reduce<T | undefined>((best, r) => (!best || r.rate > best.rate ? r : best), undefined);
}

/**
 * 유사사례(L2) 풀 집계 통계 — 상세보기 "유사 프로젝트" 패널과 공고문 붙여넣기 검색 결과가 공유한다.
 * 카드·표 없이 한 줄 요약으로 — 자리를 차지하지 않고 훑고 지나갈 수 있어야 한다.
 */
export default function SimilarStatsPanel({ stats: s }: { stats: SimilarStats }) {
  if (s.poolSize < MIN_POOL) return null;

  const parts: string[] = [];
  if (s.contractRate !== null) parts.push(`계약률 ${s.contractRate}%`);

  const topProposal = top(s.proposalBuckets);
  if (topProposal) parts.push(`제안 ${topProposal.label} 최다`);

  const deltaTotal = s.budgetDelta
    ? s.budgetDelta.increased + s.budgetDelta.same + s.budgetDelta.decreased
    : 0;
  if (s.budgetDelta && deltaTotal) {
    const topDelta = (
      [
        { label: "계약금액이 더 큼", n: s.budgetDelta.increased },
        { label: "예산과 동일", n: s.budgetDelta.same },
        { label: "계약금액이 더 작음", n: s.budgetDelta.decreased },
      ] as const
    ).reduce((best, r) => (r.n > best.n ? r : best));
    parts.push(`예산 대비 ${topDelta.label}`);
  }

  // dev_scope는 조합마다 금액 성격이 달라 분리 필수 — 표본 큰 순 상위 2개만 짧게
  const scopeParts = [...s.contractByScope]
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
    .map((sc) => `${sc.median}(${sc.label})`);
  if (scopeParts.length) parts.push(`계약금액 중앙값 ${scopeParts.join(" / ")}`);

  if (parts.length === 0) return null;

  return (
    <p className={styles.line}>
      <span className={styles.title}>유사사례 통계</span> · 상위 {s.poolSize}건 — {parts.join(" · ")}
    </p>
  );
}
