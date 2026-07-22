"use client";

// 검수 스코어링 테스트 화면 (/test) — 기존 기능과 격리된 프로토타입.
// 러프 인풋 하나 → 세 개를 병렬로 독립 로드: ①견적(prompt.md) ②스코어링 ③유사사례(기존 /api/similar 재사용).
// stateless — 저장 안 함. 결과 검증용.

import { useState } from "react";
import type { SimilarProject, ReviewTips } from "@/data/types";
import type { ScoreResult } from "@/lib/scoring";
import type { AskQuestion } from "@/lib/questions";
import type { EstimateResult, EstimateOption } from "@/lib/estimate";
import { formatManwon } from "@/lib/estimate-calc";
import styles from "./test.module.css";

const SAMPLE =
  "반려동물 산책 매칭 앱을 만들고 싶어요. 견주가 산책 도우미를 지역·시간으로 찾아 예약하고, 산책 끝나면 사진이랑 경로를 받아봐요. 결제도 앱에서 하고요. 예산은 잘 모르겠고 최대한 빨리요.";

/** purpose → 태그 클래스 (한글 클래스명은 피한다) */
const PURPOSE_CLASS: Record<AskQuestion["purpose"], string> = {
  범위: styles.qScope,
  견적: styles.qQuote,
  둘다: styles.qBoth,
};

/** confidence → 막대 색 */
function barColor(c: number): string {
  if (c >= 80) return "var(--status-success-fg)";
  if (c >= 50) return "var(--status-progress-fg)";
  return "var(--status-cancel-fg)";
}

/** 검수팁 한 그룹 (리스크/확인할것/기술쟁점) */
function TipGroup({ title, items }: { title: string; items: { text: string; freq?: number }[] }) {
  return (
    <div className={styles.tipGroup}>
      <div className={styles.tipGroupTitle}>{title}</div>
      <ul className={styles.tipList}>
        {items.map((t, i) => (
          <li key={i}>
            {t.text}
            {t.freq ? <span className={styles.tipFreq}> {t.freq}건</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 견적 옵션 카드 — 방식·포함/제외 기능·기간·파트별 금액·총금액을 한눈에 */
function OptionCard({ option }: { option: EstimateOption }) {
  const { cost } = option;
  return (
    <div className={styles.optionCard}>
      <div className={styles.optionHead}>
        <span className={styles.optionName}>{option.name}</span>
        <span className={styles.optionPeriod}>{option.period}</span>
      </div>
      {option.approach && <div className={styles.optionApproach}>{option.approach}</div>}

      {option.includedFeatures.length > 0 && (
        <ul className={styles.featIncluded}>
          {option.includedFeatures.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {option.excludedFeatures.length > 0 && (
        <ul className={styles.featExcluded}>
          {option.excludedFeatures.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}

      <div className={styles.costTable}>
        <div className={styles.costRow}>
          <span>기획</span>
          <span>{formatManwon(cost.plan.cost)}</span>
        </div>
        <div className={styles.costRow}>
          <span>디자인</span>
          <span>{formatManwon(cost.design.cost)}</span>
        </div>
        <div className={styles.costRow}>
          <span>개발</span>
          <span>{formatManwon(cost.dev.cost)}</span>
        </div>
        <div className={styles.costRow}>
          <span>QA</span>
          <span>{formatManwon(cost.qa.cost)}</span>
        </div>
        <div className={styles.costRow}>
          <span>PM</span>
          <span>{formatManwon(cost.pm.cost)}</span>
        </div>
        {(cost.rnd.low > 0 || cost.rnd.high > 0) && (
          <div className={styles.costRow}>
            <span>R&D</span>
            <span>
              {cost.rnd.low === cost.rnd.high
                ? formatManwon(cost.rnd.low)
                : `${formatManwon(cost.rnd.low)} ~ ${formatManwon(cost.rnd.high)}`}
            </span>
          </div>
        )}
      </div>
      <div className={styles.costTotal}>
        <span>총 견적 (버퍼 10% 포함)</span>
        <span className={styles.costTotalAmount}>
          {cost.total.low === cost.total.high
            ? formatManwon(cost.total.low)
            : `${formatManwon(cost.total.low)} ~ ${formatManwon(cost.total.high)}`}
        </span>
      </div>
    </div>
  );
}

export default function TestPage() {
  const [text, setText] = useState("");

  const [questions, setQuestions] = useState<AskQuestion[] | null>(null);
  const [qLoading, setQLoading] = useState(false);
  const [qError, setQError] = useState("");

  const [score, setScore] = useState<ScoreResult | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreError, setScoreError] = useState("");

  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [estLoading, setEstLoading] = useState(false);
  const [estError, setEstError] = useState("");

  const [sims, setSims] = useState<SimilarProject[] | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState("");

  // 검수팁 — 유사사례 뒤에 이어서 받는다(카드보다 5초 넘게 늦으므로 별도 상태)
  const [tips, setTips] = useState<ReviewTips | null>(null);
  const [tipsLoading, setTipsLoading] = useState(false);

  const busy = qLoading || scoreLoading || estLoading || simLoading;

  const loadTips = (normalized: string) => {
    setTipsLoading(true);
    fetch("/api/review-tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ normalized, scope: "전체" }),
    })
      .then(async (r) => {
        const d = (await r.json()) as { reviewTips?: ReviewTips; error?: string };
        if (!r.ok) throw new Error(d.error ?? "검수팁 실패");
        setTips(d.reviewTips ?? null);
      })
      .catch(() => setTips(null))
      .finally(() => setTipsLoading(false));
  };

  const run = () => {
    const body = text.trim();
    if (body.length < 3) return;

    // 넷 다 같은 인풋에서 독립적으로 — 하나가 느려도 나머지는 먼저 뜬다
    setQLoading(true);
    setQError("");
    setQuestions(null);
    fetch("/api/test-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    })
      .then(async (r) => {
        const d = (await r.json()) as { questions?: AskQuestion[]; error?: string };
        if (!r.ok) throw new Error(d.error ?? "질문 생성 실패");
        setQuestions(d.questions ?? []);
      })
      .catch((e: unknown) => setQError(e instanceof Error ? e.message : "질문 생성 실패"))
      .finally(() => setQLoading(false));

    setScoreLoading(true);
    setScoreError("");
    setScore(null);
    fetch("/api/test-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    })
      .then(async (r) => {
        const d = (await r.json()) as ScoreResult & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "스코어링 실패");
        setScore(d);
      })
      .catch((e: unknown) => setScoreError(e instanceof Error ? e.message : "스코어링 실패"))
      .finally(() => setScoreLoading(false));

    setEstLoading(true);
    setEstError("");
    setEstimate(null);
    fetch("/api/test-estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    })
      .then(async (r) => {
        const d = (await r.json()) as EstimateResult & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "견적 실패");
        setEstimate(d);
      })
      .catch((e: unknown) => setEstError(e instanceof Error ? e.message : "견적 실패"))
      .finally(() => setEstLoading(false));

    setSimLoading(true);
    setSimError("");
    setSims(null);
    setTips(null);
    fetch("/api/similar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body, scope: "전체" }),
    })
      .then(async (r) => {
        const d = (await r.json()) as { results?: SimilarProject[]; normalized?: string; error?: string };
        if (!r.ok) throw new Error(d.error ?? "유사사례 검색 실패");
        setSims(d.results ?? []);
        // 카드를 먼저 그린 뒤 검수팁을 이어서 받는다
        if (d.normalized) loadTips(d.normalized);
      })
      .catch((e: unknown) => setSimError(e instanceof Error ? e.message : "유사사례 검색 실패"))
      .finally(() => setSimLoading(false));
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>검수 스코어링 테스트</h1>
      <p className={styles.subtitle}>
        러프한 고객 의뢰를 넣으면 견적·스코어링·유사사례를 한 번에. (프로토타입 · 저장 안 됨)
      </p>

      <div className={styles.inputWrap}>
        <textarea
          className={styles.textarea}
          placeholder="고객이 보낸 정리 안 된 의뢰 내용을 붙여넣으세요…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className={styles.runRow}>
          <button className={styles.runBtn} onClick={run} disabled={busy || text.trim().length < 3}>
            {busy ? "분석 중…" : "분석"}
          </button>
          <button className={styles.runBtn} onClick={() => setText(SAMPLE)} disabled={busy} style={{ background: "var(--color-ink-muted-60)" }}>
            예시 넣기
          </button>
        </div>
      </div>

      {/* 고객에게 물어볼 질문 — 범위·견적을 위한 핵심 산출물. 스코어링과 독립. */}
      <section className={`${styles.panel} ${styles.questionsPanel}`}>
        <div className={styles.panelHead}>
          <span className={styles.panelTitle}>고객에게 물어볼 질문</span>
          <span className={styles.panelHint}>업무범위 구체화 · 견적</span>
        </div>
        {qLoading && <p className={styles.muted}>질문 뽑는 중…</p>}
        {qError && <p className={styles.err}>{qError}</p>}
        {!qLoading && !qError && !questions && <p className={styles.muted}>분석을 실행하세요.</p>}
        {questions && questions.length === 0 && <p className={styles.muted}>확인할 질문이 없어요.</p>}
        {questions && questions.length > 0 && (
          <ul className={styles.questionList}>
            {questions.map((q, i) => (
              <li key={i}>
                <span className={`${styles.qTag} ${PURPOSE_CLASS[q.purpose]}`}>{q.purpose}</span> {q.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.grid}>
        {/* 스코어링 */}
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>검수 스코어링</span>
            <span className={styles.panelHint}>공고 완성도 · 물어볼 것</span>
          </div>
          {scoreLoading && <p className={styles.muted}>평가 중…</p>}
          {scoreError && <p className={styles.err}>{scoreError}</p>}
          {!scoreLoading && !scoreError && !score && <p className={styles.muted}>분석을 실행하세요.</p>}
          {score && (
            <>
              <div className={styles.gateRow}>
                <span className={styles.total}>{score.total}</span>
                <span className={styles.totalUnit}>/ 100</span>
                <span
                  className={`${styles.gateBadge} ${score.gate.pass ? styles.gatePass : styles.gateBlock}`}
                >
                  {score.gate.pass ? "공고 작성 가능" : "정보 부족"}
                </span>
              </div>
              {!score.gate.pass && (
                <p className={styles.blocking}>필수 미달: {score.gate.blocking.join(", ")}</p>
              )}

              {score.sections.map((s) => (
                <div key={s.id} className={styles.section}>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionLabel}>{s.label}</span>
                    {s.required && <span className={styles.reqDot}>필수</span>}
                    <span className={styles.confBadge} style={{ color: barColor(s.confidence) }}>
                      {s.confidence}
                    </span>
                  </div>
                  <div className={styles.bar}>
                    <div
                      className={styles.barFill}
                      style={{ width: `${s.confidence}%`, background: barColor(s.confidence) }}
                    />
                  </div>
                  {s.summary && <p className={styles.sectionSummary}>{s.summary}</p>}
                </div>
              ))}
              {score.notes.length > 0 && (
                <div className={styles.notes}>
                  <div className={styles.notesTitle}>기타 특이사항</div>
                  <ul>
                    {score.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        {/* 유사사례 */}
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>유사사례</span>
            <span className={styles.panelHint}>과거 유사 프로젝트</span>
          </div>
          {simLoading && <p className={styles.muted}>검색 중…</p>}
          {simError && <p className={styles.err}>{simError}</p>}
          {!simLoading && !simError && !sims && <p className={styles.muted}>분석을 실행하세요.</p>}
          {sims && sims.length === 0 && <p className={styles.muted}>유사사례가 없습니다.</p>}
          {sims?.map((p) => (
            <a key={p.id} href={`/projects/${p.id}`} target="_blank" rel="noreferrer" className={styles.simItem}>
              <span className={styles.simName}>{p.name}</span>
              <span className={styles.simMeta}>
                {p.budget ? `예산 ${p.budget}` : "예산 미정"}
                {p.contractAmount && <span className={styles.simStatus}> · 계약 {p.contractAmount}</span>}
              </span>
              <span className={styles.simSim}>{Math.round(p.similarity * 100)}%</span>
            </a>
          ))}

          {/* 검수팁 — 유사 풀의 Q&A 요약을 통합(기존 /api/review-tips 재사용) */}
          {(tipsLoading || tips) && (
            <div className={styles.tips}>
              <div className={styles.tipsHead}>검수팁</div>
              {tipsLoading && !tips && <p className={styles.muted}>유사사례에서 뽑는 중…</p>}
              {tips && (
                <>
                  {tips.risks.length > 0 && (
                    <TipGroup title="리스크" items={tips.risks} />
                  )}
                  {tips.questions.length > 0 && (
                    <TipGroup title="확인할 것" items={tips.questions} />
                  )}
                  {tips.technicalNotes.length > 0 && (
                    <TipGroup title="기술 쟁점" items={tips.technicalNotes} />
                  )}
                  {tips.risks.length === 0 &&
                    tips.questions.length === 0 &&
                    tips.technicalNotes.length === 0 && (
                      <p className={styles.muted}>건질 팁이 없어요.</p>
                    )}
                </>
              )}
            </div>
          )}
        </section>

        {/* 견적 — 기능수량·기간만 LLM 판단, 금액은 estimate-calc.ts가 결정적으로 계산 */}
        <section className={`${styles.panel} ${styles.panelWide}`}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>견적</span>
            <span className={styles.panelHint}>prompt.md 단가표 · 4단계 옵션</span>
          </div>
          {estLoading && <p className={styles.muted}>견적 산출 중…</p>}
          {estError && <p className={styles.err}>{estError}</p>}
          {!estLoading && !estError && !estimate && <p className={styles.muted}>분석을 실행하세요.</p>}
          {estimate && (
            <>
              <p className={styles.estType}>
                유형: <strong>{estimate.projectType}</strong>
                {estimate.typeReason && <span className={styles.estTypeReason}> — {estimate.typeReason}</span>}
              </p>
              <div className={styles.optionGrid}>
                {estimate.options.map((o) => (
                  <OptionCard key={o.key} option={o} />
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
