import Link from "next/link";
import type { CSSProperties } from "react";
import results from "../../../analysis/submission-conversion/generated/industry-service-results.json";
import DemandViewTabs from "./DemandViewTabs";
import base from "./TargetDemandReport.module.css";
import styles from "./SubmissionPatternReport.module.css";

/**
 * 제출 원문 859건의 업종·서비스 판정과 14일 모집 전환 집계(scripts/analyze-submission-industry.mjs 산출물).
 * 집계 JSON만 읽으며 원문·프로젝트 ID는 싣지 않는다.
 */
type Range = number[] | null;
interface Rate { n: number; recruited: number; rate_pct: number; ci95: Range }
interface GroupRow extends Rate { name: string; diff_vs_rest_pctp?: number; diff_ci95?: Range; adjusted_diff_pctp?: number }
interface Comparison { a: Rate; b: Rate; diff_pctp: number; diff_ci95: Range; adjusted_diff_pctp: number }
interface Results {
  overall: Rate;
  coverage: Record<"empty_or_unclear" | "with_content" | "industry_known" | "industry_unknown_with_content", Rate>;
  content_vs_empty: Comparison;
  industry_known_vs_unknown: Comparison;
  by_system: GroupRow[];
  by_system_ai_grouped: GroupRow[];
  by_industry: GroupRow[];
  cross_min8: GroupRow[];
}

const data = results as Results;
/** 이 건수 미만 집단은 차이를 계산하지 않는다(스크립트의 MIN_N과 같아야 한다) */
const MIN_N = 20;

const signed = (v: number) => `${v > 0 ? "+" : ""}${v}`;
const range = (r?: Range) => (r ? `${r[0]}~${r[1]}` : "—");

/** 차이의 95% 범위가 0을 넘지 않으면 방향이 확인된 것으로 본다 */
function verdict(row: GroupRow): "high" | "low" | "none" | "small" {
  if (!row.diff_ci95) return "small";
  if (row.diff_ci95[0] > 0) return "high";
  if (row.diff_ci95[1] < 0) return "low";
  return "none";
}

const VERDICT_LABEL = { high: "평균보다 높음", low: "평균보다 낮음", none: "차이 확인 안 됨", small: "표본 적음" };

function RateBar({ rate, reference }: { rate: Rate; reference: number }) {
  const [lo, hi] = rate.ci95 ?? [rate.rate_pct, rate.rate_pct];
  const vars = { "--lo": `${lo}%`, "--hi": `${hi}%`, "--pt": `${rate.rate_pct}%`, "--ref": `${reference}%` } as CSSProperties;
  return (
    <div className={styles.track} style={vars} aria-hidden="true">
      <span className={styles.band} />
      <span className={styles.point} />
      <span className={styles.ref} />
    </div>
  );
}

function GroupTable({ rows, reference, referenceLabel }: { rows: GroupRow[]; reference: number; referenceLabel: string }) {
  const main = rows.filter((row) => row.n >= MIN_N);
  const small = rows.filter((row) => row.n < MIN_N);
  const line = (row: GroupRow) => {
    const v = verdict(row);
    return (
      <div key={row.name} className={`${styles.row} ${styles[v]}`}>
        <div className={styles.rowName}>
          <strong>{row.name}</strong>
          <small>{row.recruited}/{row.n}건</small>
        </div>
        <RateBar rate={row} reference={reference} />
        <div className={styles.rowValue}>
          <strong>{row.rate_pct}%</strong>
          <small>95% {range(row.ci95)}</small>
        </div>
        <div className={styles.rowDiff}>
          {row.diff_vs_rest_pctp !== undefined ? (
            <>
              <span>{signed(row.diff_vs_rest_pctp)}%p <small>({range(row.diff_ci95)})</small></span>
              <span>보정 {signed(row.adjusted_diff_pctp ?? 0)}%p</span>
            </>
          ) : (
            <span>—</span>
          )}
          <em>{VERDICT_LABEL[v]}</em>
        </div>
      </div>
    );
  };
  return (
    <>
      <div className={styles.tableHead}>
        <span>구분</span>
        <span>전환율 (세로선 = {referenceLabel} {reference}%)</span>
        <span />
        <span>나머지 대비 차이 · 층화 보정</span>
      </div>
      {main.map(line)}
      {small.length > 0 && (
        <details className={base.details}>
          <summary>{MIN_N}건 미만 {small.length}개 (차이 계산 안 함)</summary>
          <div className={styles.smallList}>{small.map(line)}</div>
        </details>
      )}
    </>
  );
}

function ComparisonBlock({ title, aLabel, bLabel, c }: { title: string; aLabel: string; bLabel: string; c: Comparison }) {
  return (
    <div className={styles.compare}>
      <h3>{title}</h3>
      <div className={styles.comparePair}>
        <div><strong>{c.a.rate_pct}%</strong><span>{aLabel} · {c.a.n}건</span></div>
        <div><strong>{c.b.rate_pct}%</strong><span>{bLabel} · {c.b.n}건</span></div>
        <div className={styles.compareDiff}><strong>{signed(c.diff_pctp)}%p</strong><span>95% {range(c.diff_ci95)} · 보정 후 {signed(c.adjusted_diff_pctp)}%p</span></div>
      </div>
    </div>
  );
}

export default function SubmissionPatternReport() {
  const { overall, coverage } = data;
  const ai = data.by_system_ai_grouped.find((row) => row.name === "AI 3종");
  const matching = data.by_system.find((row) => row.name === "서비스 매칭·중개 플랫폼");
  const aiGen = data.by_system.find((row) => row.name === "AI 생성·변환 서비스");
  const confirmedIndustries = data.by_industry.filter((row) => verdict(row) === "high" || verdict(row) === "low").length;

  return (
    <main className={base.container}>
      <div className={base.back}><Link href="/report">← 리포트</Link></div>
      <DemandViewTabs view="submission" />
      <h1 className={base.title}>제출→모집 전환 패턴: 업종·서비스</h1>
      <p className={base.lead}>외주 제출 건 중 어떤 업종·서비스가 <strong>14일 안에 모집으로 전환</strong>되는지 봅니다. 2026년 1~8월 제출 중 제출 당시 원문이 남은 {overall.n}건을 읽고 업종군·시스템 유형을 판정해 전환 결과와 대조했습니다.</p>

      <div className={base.summary}>
        <div><strong>{overall.n}</strong><span>분석 표본 (제출 당시 원문 보존)</span></div>
        <div><strong>{overall.rate_pct}%</strong><span>표본 전체 14일 전환율</span></div>
        <div><strong>{coverage.with_content.rate_pct}%</strong><span>원문에 내용이 있는 제출 ({coverage.with_content.n}건)</span></div>
        <div><strong>{coverage.empty_or_unclear.rate_pct}%</strong><span>폼 예시만 남은 빈 제출 ({coverage.empty_or_unclear.n}건)</span></div>
      </div>

      <section className={base.section}>
        <h2>요약</h2>
        <ol className={styles.findings}>
          <li><b>가장 뚜렷한 차이는 업종이 아니라 원문을 얼마나 채웠는지입니다.</b> 내용을 적은 제출은 {coverage.with_content.rate_pct}%, 빈 양식은 {coverage.empty_or_unclear.rate_pct}%가 전환됐습니다({signed(data.content_vs_empty.diff_pctp)}%p, 첨부·재방문·사업 형태 보정 후 {signed(data.content_vs_empty.adjusted_diff_pctp)}%p). 업종이 원문에 드러난 제출도 그렇지 않은 제출보다 {signed(data.industry_known_vs_unknown.diff_pctp)}%p 높았습니다.</li>
          {ai && <li><b>AI 과제는 전환율이 낮았습니다.</b> AI 챗봇·생성·분석 3종을 묶으면 {ai.rate_pct}%({ai.n}건)로 나머지보다 {signed(ai.diff_vs_rest_pctp ?? 0)}%p(95% {range(ai.diff_ci95)}), 보정 후 {signed(ai.adjusted_diff_pctp ?? 0)}%p 낮습니다.</li>}
          {matching && aiGen && <li><b>개별 유형 중에서는 서비스 매칭·중개 플랫폼({matching.rate_pct}%)과 AI 생성·변환 서비스({aiGen.rate_pct}%)가 낮게 관측됐습니다.</b> 각각 20건대이고 유형을 여러 개 비교했으므로 확정이 아닌 가설로 봅니다.</li>}
          <li><b>업종군은 평균과 확실히 구분되는 곳이 {confirmedIndustries === 0 ? "없습니다" : `${confirmedIndustries}개입니다`}.</b> 모든 업종군의 95% 범위가 평균과 겹칩니다. 방향만 참고할 수 있습니다.</li>
          <li><b>업종 × 서비스 조합은 판단할 수 없습니다.</b> 8건 이상 모인 조합이 {data.cross_min8.length}개뿐입니다.</li>
        </ol>
      </section>

      <section className={base.section}>
        <h2>1. 원문 채움 정도와 전환</h2>
        <p className={base.sectionNote}>원문에 폼 예시 문구만 남았거나 한 줄뿐이라 무엇을 만들지 알 수 없는 제출을 &lsquo;빈 양식&rsquo;으로 분류했습니다. 보정은 첨부 유무 × 신규/재방문 × 사업 형태로 층을 나눠 층 안에서 비교한 값(Mantel-Haenszel)입니다.</p>
        <ComparisonBlock title="내용 있음 vs 빈 양식" aLabel="내용 있음" bLabel="빈 양식" c={data.content_vs_empty} />
        <ComparisonBlock title="업종이 드러남 vs 내용은 있으나 업종 미상" aLabel="업종 드러남" bLabel="업종 미상" c={data.industry_known_vs_unknown} />
      </section>

      <section className={base.section}>
        <h2>2. 서비스 유형별 전환</h2>
        <p className={base.sectionNote}>내용이 있는 {coverage.with_content.n}건을 시스템 유형 38개(공고 기반 타깃 후보와 같은 분류)로 나눴습니다. 차이는 같은 {coverage.with_content.n}건 안에서 해당 유형을 뺀 나머지와 비교합니다. &lsquo;기타(비개발)&rsquo;는 디자인·자문·구인 등 개발이 아닌 의뢰입니다.</p>
        <GroupTable rows={data.by_system_ai_grouped.filter((row) => row.name === "AI 3종")} reference={coverage.with_content.rate_pct} referenceLabel="내용 있는 제출 평균" />
        <div className={styles.spacer} />
        <GroupTable rows={data.by_system} reference={coverage.with_content.rate_pct} referenceLabel="내용 있는 제출 평균" />
      </section>

      <section className={base.section}>
        <h2>3. 업종군별 전환</h2>
        <p className={base.sectionNote}>업종이 원문에 드러난 {coverage.industry_known.n}건을 업종군 33개로 나눴습니다. 발주처 업종, 또는 서비스가 겨냥하는 업종이 확인될 때만 판정했고 추정이 필요한 건은 &lsquo;미상&rsquo;으로 뺐습니다.</p>
        <GroupTable rows={data.by_industry} reference={coverage.industry_known.rate_pct} referenceLabel="업종 드러난 제출 평균" />
      </section>

      <section className={base.section}>
        <h2>4. 업종 × 서비스 조합</h2>
        <p className={base.sectionNote}>8건 이상 모인 조합만 표시합니다. 모두 95% 범위가 넓어 평균과의 차이를 말할 수 없습니다.</p>
        <GroupTable rows={data.cross_min8} reference={coverage.industry_known.rate_pct} referenceLabel="업종 드러난 제출 평균" />
      </section>

      <section className={base.section}>
        <h2>5. 방법과 한계</h2>
        <ul className={styles.limits}>
          <li><b>표본:</b> 1~8월 외주 제출 4,319건 중 제출 시점 스냅샷이 검증되고 원문이 있는 {overall.n}건입니다. 전환율이 {overall.rate_pct}%로 전체 제출(약 44%)보다 높아, 자료가 잘 남은 제출 쪽으로 치우쳤을 수 있습니다.</li>
          <li><b>결과 기준:</b> 제출 후 14일 안에 모집으로 전환됐는지입니다. 계약 여부는 별도 분석에서 봅니다.</li>
          <li><b>판정:</b> 원문을 읽고 업종군·시스템 유형을 1인(AI)이 판정했으며, 판정 시 전환 결과는 보지 않았습니다. 사람의 표본 대조 검증은 아직 하지 않았습니다.</li>
          <li><b>분류 필드 미사용:</b> 본진의 분야 선택값은 정확하지 않아 쓰지 않았고, 원문이 없는 제출에 현재 공고문을 대신 쓰지도 않았습니다(검수 중 수정된 글이라 전환 건만 업종이 잘 드러나는 편향이 생김).</li>
          <li><b>다중 비교:</b> 유형·업종을 수십 개 비교했으므로 95% 범위가 0을 벗어난 개별 유형 1~2개는 우연일 수 있습니다. 묶음 비교(AI 3종)와 원문 채움 정도가 상대적으로 믿을 만한 결과입니다.</li>
          <li><b>재제출:</b> 같은 고객이 같은 과제를 다시 낸 제출 약 40건이 포함돼 있으며, 빼고 계산해도 결과는 같았습니다.</li>
          <li><b>관찰 분석:</b> 인과가 아닙니다. 예컨대 AI 과제가 낮은 것이 과제 성격 때문인지, 이런 과제를 내는 고객 특성 때문인지는 구분하지 못합니다.</li>
        </ul>
      </section>

      <p className={base.footerNote}>재현: <code>node scripts/analyze-submission-industry.mjs</code> · 판정 파일 <code>analysis/submission-conversion/industry-service/labels/</code> · 원문 대조는 <code>review/text-samples.json</code>의 익명 ID로 합니다.</p>
    </main>
  );
}
