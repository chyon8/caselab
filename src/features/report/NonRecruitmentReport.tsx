"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NonRecruitmentStats, ReasonSegment } from "@/data/types";
import { REPORT_PERIODS, SUBMISSION_CONVERSION_FROM, type ReportPeriod } from "./period";
import { RateBars, Section, formatKst, spread } from "./Report";
import styles from "./Report.module.css";

function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}

/**
 * 세그먼트 × 사유 표. 칸 값은 그 세그먼트 유효 제출 대비 비율이라 행끼리 바로 비교된다.
 * 열마다 표본이 충분한 행 중 가장 높은 칸을 강조한다(ManagerTable의 1위 표시와 같은 규칙).
 */
function SegmentTable({ segment, columns }: { segment: ReasonSegment; columns: string[] }) {
  const solid = segment.rows.filter((r) => !r.lowSample);
  const top = columns.map((_, i) =>
    solid.length > 1 ? Math.max(...solid.map((r) => r.shares[i])) : null,
  );
  return (
    <div className={styles["table-wrap"]}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{segment.title}</th>
            <th className={styles.num}>유효 제출</th>
            <th className={styles.num}>거절률</th>
            {columns.map((c) => (
              <th key={c} className={styles.num}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {segment.rows.map((r) => (
            <tr key={r.label} className={r.lowSample ? styles["row-weak"] : ""}>
              <td>
                {r.label}
                {r.lowSample && <span className={styles.weak}> · 표본 적음</span>}
              </td>
              <td className={styles.num}>{r.total.toLocaleString()}</td>
              <td className={styles.num}>{r.rejectRate}%</td>
              {r.shares.map((share, i) => (
                <td
                  key={columns[i]}
                  className={`${styles.num} ${!r.lowSample && share > 0 && share === top[i] ? styles.best : ""}`}
                >
                  {share}%
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 제출 후 미모집 사유 리포트 (/report/non-recruitment). 권한 있는 계정에서만 렌더된다(page.tsx가 404로 막는다).
 * 모집단은 /report/conversion과 같고, 거기서 «전환 아님»으로 끝난 건이 왜 그렇게 끝났는지를 본다.
 */
export default function NonRecruitmentReport({
  stats: s,
  period,
}: {
  stats: NonRecruitmentStats;
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
              ? "/report/non-recruitment"
              : `/report/non-recruitment?period=${encodeURIComponent(p.value)}`
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

  if (s.submitted === 0) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>제출 후 미모집 사유</h1>
        {tabs}
        <p className={styles.note}>이 기간에 집계할 제출이 없습니다.</p>
      </div>
    );
  }

  const cards = [
    { value: s.valid.toLocaleString(), label: "유효 제출", sub: "전환율 화면과 같은 분모" },
    { value: s.validRejected.toLocaleString(), label: "유효 거절", sub: `유효 제출의 ${pct(s.validRejected, s.valid)}%` },
    { value: `${pct(s.noContact, s.valid)}%`, label: "연락 안됨 비율", sub: `${s.noContact.toLocaleString()}건 ÷ 유효 제출` },
    { value: s.invalidRejected.toLocaleString(), label: "무효 거절", sub: "중복등록·실수·Test 등" },
    { value: s.cancelled.toLocaleString(), label: "모집 전 직접 취소", sub: `전체 제출의 ${pct(s.cancelled, s.submitted)}%` },
    { value: s.submitted.toLocaleString(), label: "전체 제출", sub: "무효 포함" },
  ];

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>제출 후 미모집 사유</h1>
      <a className={styles["report-link"]} href="/reports/non-recruitment-report.html" target="_blank" rel="noopener">
        한 페이지 보고서 보기 (인사이트·신뢰구간) →
      </a>
      {tabs}

      <p className={styles.note}>
        {SUBMISSION_CONVERSION_FROM.slice(0, 4)}년 {Number(SUBMISSION_CONVERSION_FROM.slice(5, 7))}월
        이후 제출된 외주 기준이고, 기간 탭은 <strong>제출일</strong> 기준입니다. 거절 사유는 검수 매니저가
        남긴 최신 거절 메모의 <strong>첫 줄</strong>을 정해진 문구로 분류했습니다. 정해진 문구 없이
        서술만 있으면 «기타(서술)», 거절 기록이 없으면 «미지정»입니다. 비율의 분모는 전환율 화면과 같은
        유효 제출이고, 무효 거절과 모집 전 직접 취소는 맨 아래에 따로 묶었습니다.
        {mounted && s.asOf && <> 데이터 기준 시각 {formatKst(s.asOf)}.</>}
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

      {s.validReasons.length > 0 && (
        <Section
          title="유효 거절 사유"
          note="유효 거절 중 각 사유의 비율입니다. «연락 안됨»은 처음부터 연락이 닿지 않은 건, «재연락 후 두절»은 한 번 닿은 뒤 끊긴 건입니다."
        >
          <RateBars rows={s.validReasons} metric="구성비" sampleLabel="거절" />
        </Section>
      )}

      {s.byMonth.length > 0 && (
        <Section
          title="월별 유효 거절률 (제출월)"
          note="그 달 유효 제출 중 유효 거절의 비율입니다. 최근 달은 아직 결과 대기가 많아 낮게 보일 수 있습니다."
          finding={spread(s.byMonth)}
        >
          <RateBars rows={s.byMonth} metric="거절률" sampleLabel="제출" />
        </Section>
      )}

      {s.columns.length > 0 &&
        s.segments
          .filter((g) => g.rows.length > 0)
          .map((g) => (
            <Section
              key={g.title}
              title={`${g.title} × 사유`}
              note={[
                "칸 값은 그 줄의 유효 제출 중 해당 사유로 거절된 비율입니다. 열마다 가장 높은 칸을 강조했습니다.",
                g.note,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <SegmentTable segment={g} columns={s.columns} />
            </Section>
          ))}

      {s.invalidReasons.length > 0 && (
        <Section title="무효 거절 사유" note="전환율 집계에서는 빠지는 거절입니다. 무효 거절 중 각 사유의 비율입니다.">
          <RateBars rows={s.invalidReasons} metric="구성비" sampleLabel="거절" />
        </Section>
      )}

      {s.cancelTypes.length > 0 && (
        <Section
          title="모집 전 직접 취소 유형"
          note={`고객이 취소할 때 고른 유형입니다. ${s.cancelled.toLocaleString()}건 중 ${s.cancelledUnassigned.toLocaleString()}건은 검수 매니저 배정 전(«미배정»)에 취소됐습니다.`}
        >
          <RateBars rows={s.cancelTypes} metric="구성비" sampleLabel="취소" />
        </Section>
      )}
    </div>
  );
}
