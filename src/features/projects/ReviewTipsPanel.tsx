"use client";

import type { ReviewTips } from "@/data/types";
import styles from "./ReviewTipsPanel.module.css";

/** 표본이 이보다 적으면 팁을 내지 않는다 — 몇 건으로 "자주 나온다"고 말할 수 없다 */
const MIN_SAMPLE = 5;

/**
 * 검수 팁 — 공고문 유사사례 풀의 qna_summary를 합친 정성 인사이트.
 * SimilarStatsPanel(숫자) 바로 아래에 놓여, 숫자 뒤의 "무엇을 확인해야 하나"를 채운다.
 * 집계 방식(원본 나열 / AI 재요약)과 무관하게 ReviewTips 형태만 받는다.
 */
export default function ReviewTipsPanel({
  tips: t,
  error,
}: {
  tips: ReviewTips | null;
  error?: string | null;
}) {
  if (error) {
    return (
      <div className={styles.panel}>
        <div className={styles.head}>
          <span className={styles.chip}>검수 팁</span>
        </div>
        <div className={styles.errorBox}>
          <div className={styles["error-title"]}>⚠️ 검수 팁을 불러오지 못했어요</div>
          <div className={styles["error-desc"]}>{error}</div>
        </div>
      </div>
    );
  }

  if (!t) return null;

  if (t.sampleSize < MIN_SAMPLE) {
    return (
      <div className={styles.panel}>
        <div className={styles.head}>
          <span className={styles.chip}>검수 팁</span>
        </div>
        <div className={styles.empty}>
          <div className={styles["empty-title"]}>ℹ️ 유사사례 데이터가 부족해요</div>
          <div className={styles["empty-desc"]}>
            검수 팁을 만들려면 참고할 유사사례가 최소 {MIN_SAMPLE}건 필요한데, 지금은 {t.sampleSize}
            건뿐이에요.
          </div>
        </div>
      </div>
    );
  }

  const isEmpty =
    t.risks.length === 0 && t.questions.length === 0 && t.keywords.length === 0;

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.chip}>검수 팁</span>
        <span className={styles.sub}>
          유사사례 {t.sampleSize}건에서 자주 나온 확인 포인트
        </span>
      </div>

      {isEmpty ? (
        <div className={styles.empty}>
          <div className={styles["empty-title"]}>ℹ️ 특이사항이 적어요</div>
          <div className={styles["empty-desc"]}>
            이 유형의 과거 사례에서는 눈에 띄는 공통 리스크·질문이 잡히지 않았어요.
          </div>
        </div>
      ) : (
        <>
          {t.risks.length > 0 && (
            <div className={styles.group}>
              <div className={styles.label}>⚠️ 확인할 리스크</div>
              <ul className={styles.list}>
                {t.risks.map((r, i) => (
                  <li key={i}>
                    {r.text}
                    {r.freq != null && <span className={styles.freq}>{r.freq}건</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {t.questions.length > 0 && (
            <div className={styles.group}>
              <div className={styles.label}>❓ 자주 나온 질문</div>
              <ul className={styles.list}>
                {t.questions.map((q, i) => (
                  <li key={i}>
                    {q.text}
                    {q.freq != null && <span className={styles.freq}>{q.freq}건</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {t.keywords.length > 0 && (
            <div className={styles.group}>
              <div className={styles.label}>🏷️ 자주 등장하는 개념</div>
              <div className={styles.keywords}>
                {t.keywords.map((k) => (
                  <span key={k.term} className={styles.kw}>
                    {k.term}
                    <b>{k.count}</b>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
