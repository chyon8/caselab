"use client";

import type { CSSProperties } from "react";
import type { Breakdown, ReportStats } from "@/data/types";
import styles from "./Report.module.css";

/**
 * 막대 하나. 비율(%)을 그대로 폭으로 쓴다 — 최댓값 기준으로 정규화하면
 * "37.7%가 100% 폭"이 되어 실제보다 격차가 커 보인다.
 */
function RateBars({ rows }: { rows: Breakdown[] }) {
  return (
    <div className={styles.bars}>
      {rows.map((r) => (
        <div key={r.label} className={styles["bar-row"]}>
          <div className={styles["bar-label"]}>{r.label}</div>
          <div className={styles["bar-track"]}>
            <div
              className={styles["bar-fill"]}
              style={{ "--bar-width": `${r.rate}%` } as CSSProperties}
            />
          </div>
          <div className={styles["bar-count"]}>{r.rate}%</div>
          <div className={styles["bar-sub"]}>{r.decided.toLocaleString()}건</div>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className={styles["section-head"]}>
        <span className={styles["section-title"]}>{title}</span>
      </div>
      {note && <p className={styles.note}>{note}</p>}
      {children}
    </>
  );
}

export default function Report({ stats: s }: { stats: ReportStats }) {
  if (s.total === 0) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>리포트</h1>
        <p className={styles.note}>집계할 데이터가 없습니다.</p>
      </div>
    );
  }

  const decided = s.contracted + s.cancelled;
  const cancelRate = Math.round((s.cancelled / decided) * 1000) / 10;

  const statCards = [
    { value: s.total.toLocaleString(), label: "축적된 케이스" },
    { value: `${s.contractRate}%`, label: `계약률 — 결판난 ${decided.toLocaleString()}건 기준` },
    { value: `${cancelRate}%`, label: `취소율 — 취소 ${s.cancelled.toLocaleString()}건` },
    { value: s.pending.toLocaleString(), label: "모집 중 (결과 미정)" },
  ];

  const deltaTotal =
    s.budgetDelta.increased + s.budgetDelta.same + s.budgetDelta.decreased;
  const deltaRows: Breakdown[] = [
    { label: "계약금액이 더 큼", decided: s.budgetDelta.increased, rate: pct(s.budgetDelta.increased, deltaTotal) },
    { label: "모집 예산과 동일", decided: s.budgetDelta.same, rate: pct(s.budgetDelta.same, deltaTotal) },
    { label: "계약금액이 더 작음", decided: s.budgetDelta.decreased, rate: pct(s.budgetDelta.decreased, deltaTotal) },
  ];

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>리포트</h1>
      <p className={styles.note}>
        2024-11-11 이후 모집 전환된 외주 프로젝트 {s.total.toLocaleString()}건 기준.
        계약률의 분모는 <strong>결판난 건</strong>(계약 도달 + 취소)이며, 아직 모집 중인{" "}
        {s.pending.toLocaleString()}건은 제외했습니다.
      </p>

      <div className={styles["stat-grid"]}>
        {statCards.map((c) => (
          <div key={c.label} className={styles["stat-card"]}>
            <div className={styles["stat-value"]}>{c.value}</div>
            <div className={styles["stat-label"]}>{c.label}</div>
          </div>
        ))}
      </div>

      <Section
        title="취소는 어디서 터지는가"
        note="거의 전부가 모집 단계에서 무너집니다. 계약까지 갔다가 깨지는 경우는 극히 드뭅니다 — 승부는 모집에서 납니다."
      >
        <RateBars rows={s.cancelByStage} />
      </Section>

      <Section
        title="예산이 클수록 계약률이 떨어진다"
        note="예산대와 계약률이 단조 감소합니다. 큰 예산 프로젝트일수록 검수 단계에서 더 많은 개입이 필요하다는 신호입니다."
      >
        <RateBars rows={s.byBudget} />
      </Section>

      <Section
        title="과업 범위가 넓을수록 계약률이 떨어진다"
        note="개발·디자인·기획을 한 번에 요구하는 프로젝트가 가장 잘 깨집니다. 범위 분리를 제안할 근거가 됩니다."
      >
        <RateBars rows={s.byScope} />
      </Section>

      <Section
        title="지원자 수는 계약률을 높이지 않는다"
        note="지원이 1건이든 19건이든 계약률은 비슷하고, 20건을 넘으면 오히려 떨어집니다. 지원자를 더 모으는 것보다 '맞는' 개발사를 찾는 게 중요하다는 뜻입니다. (0건은 당연히 계약이 불가능합니다.)"
      >
        <RateBars rows={s.byProposals} />
      </Section>

      <Section
        title="모집 예산 → 실제 계약금액"
        note="계약금액이 모집 예산보다 낮아지는 경우가 더 많습니다. 예산이 부풀려 올라가는 구조가 아닙니다."
      >
        <RateBars rows={deltaRows} />
      </Section>

      <Section
        title="단계별 소요 기간 (중앙값)"
        note="검수는 대부분 당일 통과됩니다. 시간이 걸리는 구간은 모집·계약과 실제 진행입니다."
      >
        <div className={styles["stat-grid"]}>
          <div className={styles["stat-card"]}>
            <div className={styles["stat-value"]}>{s.medianDays.inspection}일</div>
            <div className={styles["stat-label"]}>검수 → 모집 전환</div>
          </div>
          <div className={styles["stat-card"]}>
            <div className={styles["stat-value"]}>{s.medianDays.recruiting}일</div>
            <div className={styles["stat-label"]}>모집 → 진행 착수 (계약 협상 포함)</div>
          </div>
          <div className={styles["stat-card"]}>
            <div className={styles["stat-value"]}>{s.medianDays.progress}일</div>
            <div className={styles["stat-label"]}>진행 착수 → 완료</div>
          </div>
        </div>
      </Section>
    </div>
  );
}

function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}
