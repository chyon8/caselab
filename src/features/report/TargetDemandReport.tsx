import Link from "next/link";
import type { CSSProperties } from "react";
import type { TargetDemandCandidate, TargetDemandStats, TargetDemandTally } from "@/data/types";
import DemandViewTabs from "./DemandViewTabs";
import { REPORT_PERIODS, type ReportPeriod } from "./period";
import styles from "./TargetDemandReport.module.css";

/** 모집량 순위는 그룹이 수백 개라 상위만 카드로 보인다 */
const VOLUME_LIMIT = 30;

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeZone: "Asia/Seoul" }).format(new Date(value));
}

function PeriodTabs({ period }: { period: ReportPeriod }) {
  return (
    <div className={styles.tabs} aria-label="기간">
      {REPORT_PERIODS.map((item) => (
        <Link
          key={item.value}
          href={item.value === "전체" ? "/report/target-demand" : `/report/target-demand?period=${encodeURIComponent(item.value)}`}
          className={`${styles.tab} ${item.value === period ? styles.active : ""}`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function formatWon(value: number | null) {
  if (value === null) return "—";
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(value % 100_000_000 === 0 ? 0 : 1)}억원`;
  return `${Math.round(value / 10_000).toLocaleString()}만원`;
}

/** 세부 표기 상위 몇 개와 나머지 개수 — "학원 12 · 교육·과외 3 외 2종" */
function TallyLine({ items, limit }: { items: TargetDemandTally[]; limit: number }) {
  const rest = items.length - limit;
  return (
    <>
      {items.slice(0, limit).map((item) => `${item.label} ${item.count}`).join(" · ")}
      {rest > 0 && ` 외 ${rest}종`}
    </>
  );
}

function CandidateCard({ candidate, metric, rank, max }: { candidate: TargetDemandCandidate; metric: "volume" | "contract" | "amount"; rank: number; max: number }) {
  const value = metric === "volume" ? candidate.total : metric === "contract" ? candidate.contractRate : (candidate.contractMedian ?? 0);
  const metricValue = metric === "volume"
    ? `${candidate.total.toLocaleString()}건`
    : metric === "contract"
      ? `${candidate.contractRate}%`
      : formatWon(candidate.contractMedian);
  const metricLabel = metric === "volume" ? "고유 수요" : metric === "contract" ? "계약률" : "계약금액 중앙값";
  return (
    <article className={`${styles.card} ${candidate.lowSample ? styles.weak : ""}`}>
      <div className={styles.cardTop}>
        <span className={styles.rank}>{rank}</span>
        <div className={styles.cardTitle}>
          <h3>{candidate.industry}</h3>
          <p>{candidate.system}</p>
        </div>
        <div className={styles.metric}>
          <strong>{metricValue}</strong>
          <small>{metricLabel}</small>
        </div>
      </div>

      <div className={styles.definition}>
        <div><span>세부 업종</span><TallyLine items={candidate.industries} limit={6} /></div>
        <div><span>세부 시스템</span><TallyLine items={candidate.systems} limit={6} /></div>
        <div><span>주요 업무·문제</span><TallyLine items={candidate.problems} limit={5} /></div>
      </div>

      <div className={styles.barTrack} aria-hidden="true">
        <div className={styles.barFill} style={{ "--bar-width": `${(value / max) * 100}%` } as CSSProperties} />
      </div>
      <div className={styles.resultLine}>
        고유 수요 {candidate.total.toLocaleString()}건(공고 {candidate.postings.toLocaleString()}건) · 계약 {candidate.contracted.toLocaleString()}건 / 결판 {candidate.decided.toLocaleString()}건
        {metric === "contract" && candidate.contractRateCi && <> · 95% 범위 {candidate.contractRateCi.low}~{candidate.contractRateCi.high}%</>}
        {metric === "amount" && <> · 금액 확인 {candidate.contractAmountCount.toLocaleString()}건 · 평균 {formatWon(candidate.contractMean)}</>}
        {candidate.lowSample && <span className={styles.sampleWarning}> · 표본 적음</span>}
      </div>

      <details className={styles.details}>
        <summary>판정 기준과 포함 공고 {candidate.examples.length.toLocaleString()}건 전체</summary>
        <p><b>포함:</b> {candidate.inclusion}</p>
        <p><b>제외:</b> {candidate.exclusion}</p>
        <div className={styles.examples}>
          {candidate.examples.map((example) => (
            <Link key={example.id} href={`/projects/${example.id}`} className={styles.example}>
              <strong>{example.title} · {example.status}{example.duplicateOf && ` · 재등록(대표 ${example.duplicateOf})`}</strong>
              <span>판정: {example.detail}</span>
              <span>업종 근거: {example.evidence.industry || "—"}</span>
              <span>업무 근거: {example.evidence.problem || "—"}</span>
              <span>시스템 근거: {example.evidence.system || "—"}</span>
            </Link>
          ))}
        </div>
      </details>
    </article>
  );
}

export default function TargetDemandReport({ stats, period }: { stats: TargetDemandStats; period: ReportPeriod }) {
  const volumeMax = Math.max(...stats.byVolume.map((candidate) => candidate.total), 1);
  const amountMax = Math.max(...stats.byContractAmount.map((candidate) => candidate.contractMedian ?? 0), 1);
  return (
    <main className={styles.container}>
      <div className={styles.back}><Link href="/report">← 리포트</Link></div>
      <DemandViewTabs view="target" />
      <h1 className={styles.title}>공고 기반 타깃 후보 분석</h1>
      <p className={styles.lead}>마케팅 타깃을 정하기 위해 공고를 <strong>업종군 × 시스템 유형</strong>으로 묶어 어떤 수요가 반복되는지 봅니다. 카드마다 그 안에 묶인 세부 업종·시스템·업무를 건수와 함께 표시합니다.</p>
      <a className={styles.reportLink} href="/reports/target-demand-report.html" target="_blank" rel="noopener">한 페이지 보고서 보기 (대분류·소분류 모집·계약률) →</a>
      <PeriodTabs period={period} />

      <div className={styles.summary}>
        <div><strong>{stats.processing.eligiblePostings.toLocaleString()}</strong><span>분석 대상 공고 (전량 배정)</span></div>
        <div><strong>{stats.processing.group.toLocaleString()}</strong><span>그룹에 묶인 고유 수요 ({stats.processing.groups.toLocaleString()}개 그룹)</span></div>
        <div><strong>{stats.contracted.toLocaleString()}</strong><span>계약 도달 (기간 내 그룹+단건)</span></div>
        <div><strong>{stats.contractRate}%</strong><span>그룹+단건 전체 계약률</span></div>
      </div>
      <p className={styles.note}>처리 내역: 공고 {stats.processing.eligiblePostings.toLocaleString()}건 → 재등록을 합친 고유 수요 {stats.processing.units.toLocaleString()}건 = 그룹 {stats.processing.group.toLocaleString()} · 단건 {stats.processing.single.toLocaleString()} · 문맥 부족/모호 {stats.processing.ambiguous.toLocaleString()} · 비개발 제외 {stats.processing.excluded.toLocaleString()} · 미배정 {stats.processing.unassigned.toLocaleString()}. 기간 필터를 걸면 그 기간에 모집된 공고만 집계합니다.</p>
      <p className={styles.note}>모집 전환일 기준 {formatDate(stats.coverage.from)} ~ {formatDate(stats.coverage.to)}. 현재 모집중인 공고만이 아니라 모집 이후 계약 진행·계약 완료·성공·취소까지 모두 포함합니다. 계약은 stage 3 이상이면서 취소가 아닌 공고, 계약률 분모는 결판(stage 3 이상 또는 취소) 공고입니다.</p>
      <p className={styles.method}>분석 대상은 모집 전환된 공고 중 원문에 업종이 명시된 공고입니다(업종이 드러나지 않은 공고는 제외). 공고마다 세부 업종·업무·시스템을 판정한 뒤, 세부 업종 {stats.processing.industries}종을 업종군 {stats.processing.industryGroups}개로, 세부 시스템 {stats.processing.systems}종을 시스템 유형 {stats.processing.systemTypes}개로 올려 묶었습니다. 업종군과 시스템 유형이 같고 발주처가 2곳 이상인 수요만 그룹으로 두며, 같은 프로젝트의 재등록·분할 공고는 1건으로 셉니다. 모든 카드에서 포함 공고 전체와 공고별 판정·원문 근거를 확인할 수 있습니다.</p>

      <section className={styles.section}>
        <h2>1. 모집이 많은 타깃 후보</h2>
        <p className={styles.sectionNote}>같은 업종군 × 시스템 유형 수요가 몇 건 모집됐는지(재등록 제외) 봅니다. 상위 {VOLUME_LIMIT}개 그룹을 표시하며(전체 {stats.byVolume.length}개), 이 순위는 계약률·금액과 합산하지 않습니다.</p>
        {stats.byVolume.slice(0, VOLUME_LIMIT).map((candidate, index) => (
          <CandidateCard key={candidate.id} candidate={candidate} metric="volume" rank={index + 1} max={volumeMax} />
        ))}
      </section>

      <section className={styles.section}>
        <h2>2. 계약률이 높은 타깃 후보</h2>
        <p className={styles.sectionNote}>결판난 수요 중 계약에 도달한 비율입니다. 결판 {stats.minDecided}건 이상인 그룹만 비교합니다({stats.byContractRate.length}개). 그룹당 결판이 10~30건 수준이라 95% 범위가 넓습니다 — 범위가 전체 계약률 {stats.contractRate}%를 포함하면 평균과 다르다고 말할 수 없습니다.</p>
        {stats.byContractRate.map((candidate, index) => (
          <CandidateCard key={candidate.id} candidate={candidate} metric="contract" rank={index + 1} max={100} />
        ))}
      </section>

      <section className={styles.section}>
        <h2>3. 계약 금액이 높은 타깃 후보</h2>
        <p className={styles.sectionNote}>계약에 도달하고 계약금액이 0보다 큰 수요가 {stats.minAmounts}건 이상인 그룹만 중앙값으로 비교합니다({stats.byContractAmount.length}개). 카드마다 금액 확인 건수와 평균을 함께 표시합니다.</p>
        {stats.byContractAmount.map((candidate, index) => (
          <CandidateCard key={candidate.id} candidate={candidate} metric="amount" rank={index + 1} max={amountMax} />
        ))}
      </section>

      <p className={styles.footerNote}>이 결과는 마케팅 후보를 좁히기 위한 관찰 분석입니다. 특정 업종에 마케팅하면 계약이 발생한다고 해석하지 않으며, 후보를 실제 캠페인 타깃으로 확정하기 전 각 카드의 원문 사례와 반복 고객·월별 분포를 함께 검토해야 합니다.</p>
    </main>
  );
}
