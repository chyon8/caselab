"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { Breakdown, ReportStats } from "@/data/types";
import { formatWon } from "@/lib/format";
import { REPORT_PERIODS, type ReportPeriod } from "./period";
import styles from "./Report.module.css";

/** 막대가 나타내는 %가 무슨 %인지 — 섹션마다 다르다. 안 쓰면 계약률과 구성비가 같은 칸에서 섞여 보인다 */
type Metric = "계약률" | "구성비";

/**
 * 막대 하나. 비율(%)을 그대로 폭으로 쓴다 — 최댓값 기준으로 정규화하면
 * "37.7%가 100% 폭"이 되어 실제보다 격차가 커 보인다.
 */
function RateBars({ rows, metric }: { rows: Breakdown[]; metric: Metric }) {
  return (
    <div className={styles.bars}>
      <div className={`${styles["bar-row"]} ${styles["bar-head"]}`}>
        <div />
        <div />
        <div className={styles["bar-count"]}>{metric}</div>
        <div className={styles["bar-sub"]}>표본</div>
      </div>
      {rows.map((r) => (
        <div
          key={r.label}
          className={`${styles["bar-row"]} ${r.lowSample ? styles["bar-row-weak"] : ""}`}
        >
          <div className={styles["bar-label"]}>{r.label}</div>
          <div className={styles["bar-track"]}>
            <div
              className={styles["bar-fill"]}
              style={{ "--bar-width": `${r.rate}%` } as CSSProperties}
            />
          </div>
          <div className={styles["bar-count"]}>{r.rate}%</div>
          <div className={styles["bar-sub"]}>
            {r.decided.toLocaleString()}건
            {r.lowSample && <span className={styles.weak}> · 표본 적음</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  note,
  finding,
  children,
}: {
  title: string;
  note?: string;
  /** 데이터에서 계산한 한 줄. 손으로 쓴 결론은 데이터가 바뀌면 거짓말이 된다 */
  finding?: string | null;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className={styles["section-head"]}>
        <span className={styles["section-title"]}>{title}</span>
      </div>
      {note && <p className={styles.note}>{note}</p>}
      {finding && <p className={styles.finding}>{finding}</p>}
      {children}
    </>
  );
}

export default function Report({
  stats: s,
  period,
  lastSyncAt,
}: {
  stats: ReportStats;
  period: ReportPeriod;
  lastSyncAt: string | null;
}) {
  // ko-KR 날짜 포맷(Intl)은 서버(Node ICU)와 브라우저(V8 ICU) 버전에 따라 구두점·공백이
  // 미묘하게 달라질 수 있다. SSR에서 바로 그리면 하이드레이션 불일치가 난다 — 마운트 후에만
  // 채운다(SyncButton.tsx와 동일 패턴). 최초 페인트는 항상 placeholder라 서버·클라이언트가 일치.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const tabs = (
    <div className={styles.tabs} role="tablist" aria-label="기간">
      {REPORT_PERIODS.map((p) => (
        <Link
          key={p.value}
          href={p.value === "전체" ? "/report" : `/report?period=${encodeURIComponent(p.value)}`}
          className={`${styles.tab} ${p.value === period ? styles["tab-on"] : ""}`}
          role="tab"
          aria-selected={p.value === period}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );

  if (s.total === 0) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>리포트</h1>
        {tabs}
        <p className={styles.note}>이 기간에 집계할 데이터가 없습니다.</p>
      </div>
    );
  }

  const decided = s.contracted + s.cancelled;
  const cancelRate = decided ? Math.round((s.cancelled / decided) * 1000) / 10 : 0;
  const median = formatWon(s.contractMedian);
  const mean = formatWon(s.contractMean);

  const statCards = [
    { value: s.total.toLocaleString(), label: "이 기간 모집 전환된 케이스" },
    { value: `${s.contractRate}%`, label: `계약률 — 결판난 ${decided.toLocaleString()}건 기준` },
    { value: `${cancelRate}%`, label: `취소율 — 취소 ${s.cancelled.toLocaleString()}건` },
    { value: median ?? "—", label: "계약금액 중앙값 — 전형적인 건 (0원 제외)" },
    { value: mean ?? "—", label: "계약금액 평균 — 중앙값과 벌어지면 대형 건이 끌어올린 것" },
    { value: s.pending.toLocaleString(), label: `모집 중 (결과 미정 · 전체의 ${s.pendingRate}%)` },
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
      {tabs}

      <p className={styles.note}>
        {mounted ? rangeLabel(s.coverage) : "이 기간"} 모집 전환된 외주 프로젝트{" "}
        {s.total.toLocaleString()}건 기준. 계약률의 분모는 <strong>결판난 건</strong>(계약 도달 +
        취소)이며, 아직 모집 중인 {s.pending.toLocaleString()}건은 제외했습니다.
        {mounted && lastSyncAt && <> 데이터 기준 시각 {formatKst(lastSyncAt)}.</>}
      </p>

      {s.pendingRate >= 20 && (
        <p className={styles.warn}>
          이 기간은 {s.total.toLocaleString()}건 중 {s.pending.toLocaleString()}건(
          {s.pendingRate}%)이 아직 모집 중입니다. 계약률은 먼저 결판난 건만 반영하므로,
          최근 구간일수록 실제와 다를 수 있습니다 — 넓은 기간과 같이 보세요.
        </p>
      )}

      <div className={styles["stat-grid"]}>
        {statCards.map((c) => (
          <div key={c.label} className={styles["stat-card"]}>
            <div className={styles["stat-value"]}>{c.value}</div>
            <div className={styles["stat-label"]}>{c.label}</div>
          </div>
        ))}
      </div>

      <Section
        title="예산이 클수록 계약률이 떨어진다"
        note="예산대와 계약률이 단조 감소합니다. 큰 예산 프로젝트일수록 검수 단계에서 더 많은 개입이 필요하다는 신호입니다. (월 단가 기간제 건은 총액과 섞이면 규모가 왜곡되므로 제외했습니다.)"
        finding={spread(s.byBudget)}
      >
        <RateBars rows={s.byBudget} metric="계약률" />
      </Section>

      <Section
        title="과업 범위가 넓을수록 계약률이 떨어진다"
        note="개발·디자인·기획을 한 번에 요구하는 프로젝트가 가장 잘 깨집니다. 범위 분리를 제안할 근거가 됩니다."
        finding={spread(s.byScope)}
      >
        <RateBars rows={s.byScope} metric="계약률" />
      </Section>

      <Section
        title="지원자 수는 계약률을 높이지 않는다"
        note="지원이 1건이든 19건이든 계약률은 비슷하고, 20건을 넘으면 오히려 떨어집니다. 지원자를 더 모으는 것보다 '맞는' 개발사를 찾는 게 중요하다는 뜻입니다. (0건은 당연히 계약이 불가능합니다.)"
        finding={spread(s.byProposals)}
      >
        <RateBars rows={s.byProposals} metric="계약률" />
      </Section>

      <Section
        title="모집 예산 → 실제 계약금액"
        note={
          "계약금액이 모집 예산보다 낮아지는 경우가 더 많습니다. 예산이 부풀려 올라가는 구조가 아닙니다." +
          (s.budgetDelta.zeroExcluded
            ? ` (계약금액이 0원으로 들어온 ${s.budgetDelta.zeroExcluded.toLocaleString()}건은 미기재로 보고 제외했습니다.)`
            : "")
        }
        finding={topShare(deltaRows)}
      >
        <RateBars rows={deltaRows} metric="구성비" />
      </Section>

      <Section
        title="계약금액 구간별 분포"
        note="계약까지 간 건을 계약금액 구간으로 나눈 구성비입니다. 계약금액이 0원으로 들어온 건은 미기재로 보고 제외했습니다."
        finding={topShare(s.contractByAmount)}
      >
        <RateBars rows={s.contractByAmount} metric="구성비" />
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
          <div className={styles["stat-card"]}>
            <div className={styles["stat-value"]}>{s.medianDays.cancelled}일</div>
            <div className={styles["stat-label"]}>모집 → 취소 (깨진 건)</div>
          </div>
        </div>
      </Section>
    </div>
  );
}

function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}

/**
 * "2024-11-11 이후" 같은 문구를 손으로 쓰면 데이터가 늘어날 때 틀린다 — 실제 범위를 쓴다.
 * timeZone 고정 필수: 서버(Vercel=UTC)와 브라우저(KST)가 다른 날짜를 그리면 하이드레이션이 깨진다.
 */
function rangeLabel({ from, to }: ReportStats["coverage"]): string {
  const d = (v: string | null) =>
    v ? new Date(v).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" }) : null;
  const a = d(from);
  const b = d(to);
  return a && b ? `${a} ~ ${b}` : "전체 기간";
}

/** SyncButton과 같은 형식 — 같은 값(마지막 동기화 시각)이 화면마다 다르게 보이면 안 된다 */
function formatKst(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 최고·최저 구간을 데이터에서 뽑아 한 줄로 만든다.
 * 표본이 충분한 행만 쓴다 — 30건짜리 구간이 "가장 낮음"으로 뽑히면 없는 경향을 만들어낸다.
 */
function spread(rows: Breakdown[]): string | null {
  const solid = rows.filter((r) => !r.lowSample);
  if (solid.length < 2) return null;
  const hi = solid.reduce((a, b) => (b.rate > a.rate ? b : a));
  const lo = solid.reduce((a, b) => (b.rate < a.rate ? b : a));
  if (hi.label === lo.label) return null;
  const gap = Math.round((hi.rate - lo.rate) * 10) / 10;
  return `가장 높은 «${hi.label}» ${hi.rate}% ↔ 가장 낮은 «${lo.label}» ${lo.rate}% — ${gap}%p 차이.`;
}

/** 구성비 섹션용 — 1위가 얼마나 쏠려 있는지 */
function topShare(rows: Breakdown[]): string | null {
  if (rows.length === 0) return null;
  const top = rows.reduce((a, b) => (b.rate > a.rate ? b : a));
  return `«${top.label}»가 ${top.rate}%로 가장 많습니다 (${top.decided.toLocaleString()}건).`;
}
