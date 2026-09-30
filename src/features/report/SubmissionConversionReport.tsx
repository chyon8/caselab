"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { SubmissionConversionStats } from "@/data/types";
import { REPORT_PERIODS, SUBMISSION_CONVERSION_FROM, type ReportPeriod } from "./period";
import { RateBars, Section, formatKst, spread } from "./Report";
import styles from "./Report.module.css";

function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}

/**
 * 제출→모집 전환 리포트 (/report/conversion). 권한 있는 계정에서만 렌더된다(page.tsx가 404로 막는다).
 * 모집단이 모집 전환 건이 아니라 제출된 외주 전체라 /report와 페이지를 나눴다.
 */
export default function SubmissionConversionReport({
  stats: c,
  period,
}: {
  stats: SubmissionConversionStats;
  period: ReportPeriod;
}) {
  // 기준 시각 포맷은 서버·브라우저 ICU 차이로 하이드레이션이 깨질 수 있다 — 마운트 후에만 그린다(Report.tsx와 같음)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const tabs = (
    <div className={styles.tabs} role="tablist" aria-label="기간">
      {REPORT_PERIODS.map((p) => (
        <Link
          key={p.value}
          href={
            p.value === "전체"
              ? "/report/conversion"
              : `/report/conversion?period=${encodeURIComponent(p.value)}`
          }
          className={`${styles.tab} ${p.value === period ? styles["tab-on"] : ""}`}
          role="tab"
          aria-selected={p.value === period}
        >
          {p.label}
        </Link>
      ))}
    </div>
  );

  if (c.total === 0) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>제출 → 모집 전환</h1>
        {tabs}
        <p className={styles.note}>이 기간에 집계할 제출이 없습니다.</p>
      </div>
    );
  }

  const cards = [
    { value: c.total.toLocaleString(), label: "제출", sub: "이 기간 (제출일 기준)" },
    { value: c.recruited.toLocaleString(), label: "모집 전환", sub: "기간 제한 없음" },
    { value: `${c.rate}%`, label: "전환률", sub: "전환 ÷ 제출" },
    { value: c.rejected.toLocaleString(), label: "거절", sub: `제출의 ${pct(c.rejected, c.total)}%` },
    { value: c.cancelled.toLocaleString(), label: "취소", sub: `제출의 ${pct(c.cancelled, c.total)}%` },
    { value: c.pending.toLocaleString(), label: "결과 대기", sub: "분모에 포함" },
  ];

  const groups = [
    {
      title: "월별 (제출월)",
      note: "제출한 달(KST)에 넣습니다. 10월 제출·11월 전환은 10월 전환입니다 — 최근 달은 며칠간 조금 오를 수 있습니다.",
      rows: c.byMonth,
    },
    {
      title: "검수 매니저별",
      note:
        "본진 담당 검수 매니저 기준입니다. 담당이 지정되지 않은 제출은 «미배정»입니다. 전환률 차이는 " +
        "역량만이 아니라 배정된 건의 구성 차이도 반영합니다.",
      rows: c.byManager,
    },
    { title: "첫 제출 고객 vs 재이용 고객", note: "이 제출 전에 외주를 제출한 적이 있으면 재이용 고객입니다.", rows: c.byHistory },
    { title: "제출 시 첨부", note: "제출 시점에 붙어 있던 파일 기준입니다.", rows: c.byAttachment },
    { title: "사업 형태", rows: c.byBusinessForm },
    {
      title: "가입 경로",
      note: "고객 계정의 가입 경로(본진 client.acquisition_path)입니다. 이번 제출의 유입 경로가 아닙니다. 값이 없으면 «미응답»입니다.",
      rows: c.byAcquisition,
    },
    { title: "대표 분야", note: "분야가 60종이 넘어 제출이 20건 이상인 분야만 싣습니다.", rows: c.byField },
  ];

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>제출 → 모집 전환</h1>
      {tabs}

      <p className={styles.note}>
        {SUBMISSION_CONVERSION_FROM.slice(0, 4)}년 {Number(SUBMISSION_CONVERSION_FROM.slice(5, 7))}월
        이후 제출된 외주 {c.total.toLocaleString()}건 기준. 기간 탭은 <strong>제출일</strong>
        기준입니다. 제출 후 언제든 모집되면 전환으로 세고, 아직 결과 대기인{" "}
        {c.pending.toLocaleString()}건도 분모에 포함했습니다. 제출 20건 미만인 줄은 흐리게 표시했습니다.
        {mounted && c.asOf && <> 데이터 기준 시각 {formatKst(c.asOf)}.</>}
      </p>

      <div className={`${styles["stat-grid"]} ${styles["stat-row-6"]}`}>
        {cards.map((card) => (
          <div key={card.label} className={styles["stat-card"]}>
            <div className={styles["stat-value"]}>{card.value}</div>
            <div className={styles["stat-label"]}>{card.label}</div>
            <div className={styles["stat-sub"]}>{card.sub}</div>
          </div>
        ))}
      </div>

      {groups
        .filter((g) => g.rows.length > 0)
        .map((g) => (
          <Section key={g.title} title={g.title} note={g.note} finding={spread(g.rows)}>
            <RateBars rows={g.rows} metric="전환률" sampleLabel="제출" />
          </Section>
        ))}
    </div>
  );
}
