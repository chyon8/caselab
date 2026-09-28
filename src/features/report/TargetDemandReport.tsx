import Link from "next/link";
import type { CSSProperties } from "react";
import type { TargetDemandCandidate, TargetDemandStats } from "@/data/types";
import { REPORT_PERIODS, type ReportPeriod } from "./period";
import styles from "./TargetDemandReport.module.css";

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

function CandidateCard({ candidate, metric, rank, max }: { candidate: TargetDemandCandidate; metric: "volume" | "contract"; rank: number; max: number }) {
  const value = metric === "volume" ? candidate.total : candidate.contractRate;
  return (
    <article className={`${styles.card} ${candidate.lowSample ? styles.weak : ""}`}>
      <div className={styles.cardTop}>
        <span className={styles.rank}>{rank}</span>
        <div className={styles.cardTitle}>
          <h3>{candidate.title}</h3>
          <p>{candidate.industry}</p>
        </div>
        <div className={styles.metric}>
          <strong>{metric === "volume" ? `${candidate.total.toLocaleString()}건` : `${candidate.contractRate}%`}</strong>
          <small>{metric === "volume" ? "모집 건수" : "계약률"}</small>
        </div>
      </div>

      <div className={styles.definition}>
        <div><span>업무·문제</span>{candidate.problem}</div>
        <div><span>시스템·서비스</span>{candidate.system}</div>
      </div>

      <div className={styles.barTrack} aria-hidden="true">
        <div className={styles.barFill} style={{ "--bar-width": `${(value / max) * 100}%` } as CSSProperties} />
      </div>
      <div className={styles.resultLine}>
        모집 {candidate.total.toLocaleString()}건 · 계약 {candidate.contracted.toLocaleString()}건 · 결판 {candidate.decided.toLocaleString()}건
        {candidate.lowSample && <span className={styles.sampleWarning}> · 표본 적음</span>}
      </div>

      <details className={styles.details}>
        <summary>판정 기준과 실제 공고 사례</summary>
        <p><b>포함:</b> {candidate.inclusion}</p>
        <p><b>제외:</b> {candidate.exclusion}</p>
        <div className={styles.examples}>
          {candidate.examples.map((example) => (
            <Link key={example.id} href={`/projects/${example.id}`} className={styles.example}>
              <strong>{example.title}</strong>
              <span>{example.excerpt || "공고 본문 미리보기 없음"}</span>
            </Link>
          ))}
        </div>
      </details>
    </article>
  );
}

export default function TargetDemandReport({ stats, period }: { stats: TargetDemandStats; period: ReportPeriod }) {
  const volumeMax = Math.max(...stats.byVolume.map((candidate) => candidate.total), 1);
  return (
    <main className={styles.container}>
      <div className={styles.back}><Link href="/report">← 리포트</Link></div>
      <h1 className={styles.title}>공고 기반 타깃 후보 분석</h1>
      <p className={styles.lead}>마케팅 타깃을 정하기 위해, 단순 업종이나 개발 카테고리가 아니라 <strong>업종 + 구체적인 업무·문제 + 시스템·서비스</strong>가 함께 나타나는 공고 조합을 찾습니다.</p>
      <PeriodTabs period={period} />

      <div className={styles.summary}>
        <div><strong>{stats.total.toLocaleString()}</strong><span>모집 전환 공고</span></div>
        <div><strong>{stats.classified.toLocaleString()}</strong><span>후보에 포함된 공고</span></div>
        <div><strong>{stats.contracted.toLocaleString()}</strong><span>계약 도달</span></div>
        <div><strong>{stats.contractRate}%</strong><span>전체 후보 계약률</span></div>
      </div>
      <p className={styles.note}>모집 전환일 기준 {formatDate(stats.coverage.from)} ~ {formatDate(stats.coverage.to)}. 현재 모집중인 공고만이 아니라 모집 이후 계약 진행·계약 완료·성공·취소까지 모두 포함합니다. 계약률은 결판난 공고만 분모로 계산합니다.</p>
      <p className={styles.method}>분류는 성과를 보기 전에 고정한 원문 규칙으로 수행합니다. 업종, 업무·문제, 시스템·서비스가 함께 확인되는 후보만 표시하며 후보 간 중복은 허용합니다. 표본 5건 미만은 제외하고, 결판 20건 미만 계약률은 참고용으로 흐리게 표시합니다.</p>

      <section className={styles.section}>
        <h2>1. 모집이 많은 타깃 후보</h2>
        <p className={styles.sectionNote}>어떤 고객군의 어떤 문제 해결형 개발이 반복적으로 모집됐는지 봅니다. 이 순위는 계약률과 합산하지 않습니다.</p>
        {stats.byVolume.map((candidate, index) => (
          <CandidateCard key={candidate.id} candidate={candidate} metric="volume" rank={index + 1} max={volumeMax} />
        ))}
      </section>

      <section className={styles.section}>
        <h2>2. 계약률이 높은 타깃 후보</h2>
        <p className={styles.sectionNote}>같은 후보 조합이 실제 계약으로 이어진 비율입니다. 표본이 충분한 후보를 우선 위에 보여주되, 모집량도 함께 확인해야 합니다.</p>
        {stats.byContractRate.map((candidate, index) => (
          <CandidateCard key={candidate.id} candidate={candidate} metric="contract" rank={index + 1} max={100} />
        ))}
      </section>

      <p className={styles.footerNote}>이 결과는 마케팅 후보를 좁히기 위한 관찰 분석입니다. 특정 업종에 마케팅하면 계약이 발생한다고 해석하지 않으며, 후보를 실제 캠페인 타깃으로 확정하기 전 각 카드의 원문 사례와 반복 고객·월별 분포를 함께 검토해야 합니다.</p>
    </main>
  );
}
