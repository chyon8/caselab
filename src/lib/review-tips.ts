// 검수 팁 묶기(per-search) — 공고문 붙여넣기 검색으로 찾은 유사사례 풀(30건)의
// qna 요약(리스크·질문·키워드)을 gpt-4o-mini로 의미별로 통합한다.
// 워딩만 다르고 본질이 같은 항목을 하나로 묶고, 그 주제가 나타난 프로젝트 수(freq)를 센다.
// 고정 태그 사전 없이 매 검색마다 그 풀의 실제 내용을 읽어 묶으므로 도메인 특화 리스크도 살아남는다.
// 결과는 지금 UI 형태(ReviewTips)와 정확히 일치한다. 저장하지 않는다(검색 시 즉석 생성).

import type { ReviewTips } from "@/data/types";

/** 묶기 입력 — 유사 풀 각 프로젝트의 qna 요약 일부 */
export interface PoolQna {
  title: string;
  riskSignals: string[];
  keyQuestions: string[];
  keywords: string[];
}

const PROMPT = `너는 위시켓 프로젝트 "검수 매니저"를 돕는 컨설팅 어시스턴트다.
지금 검수 중인 공고와 의미상 유사했던 과거 프로젝트 N건의 요약을 받는다.
목표: 이 유형을 검수할 때 "미리 확인·확정해야 할 핵심"을 압축해 준다. 나열이 아니라 통찰이다.

절대 규칙:
1. 강하게 통합한다. 워딩만 다르고 본질이 같은 것은 반드시 하나로 묶는다.
   개별 프로젝트의 문장을 그대로 복사하지 말고, 여러 건을 관통하는 공통 주제로 승격시킨다.
2. 각 섹션은 최대 개수를 넘기지 않는다: risks 6개, questions 6개, keywords 12개.
   많이 나열하지 말고, 가장 반복되고 중요한 것만 남긴다. 못 미치면 적게 내도 된다.
3. freq/count = 그 주제가 나타난 서로 다른 프로젝트 수(정수). freq 높은 순 정렬.
4. risks: "무엇을 확인/대비해야 하는지" 행동 지시형. (예: "결제·정산 방식과 환불 규정을 계약 전 확정")
5. questions: 개별 질문 나열이 아니라, 이 유형에서 반복적으로 "미리 확정해야 하는 결정 포인트"로 묶는다.
   (예: 흩어진 결제 질문들 → "결제 방식(전액/예약금/현장) 및 PG·정산 구조 확정")
6. keywords: 같은 개념은 하나로 합치고(예: "다국어"와 "다국어 지원"은 하나), 중복 출력 금지.
7. 입력에 실제로 있는 내용만. 없는 것 지어내지 않기. 없으면 빈 배열.
한국어. 아래 JSON으로만 답한다.

{
  "risks":     [{ "text": "...", "freq": 정수 }],
  "questions": [{ "text": "...", "freq": 정수 }],
  "keywords":  [{ "term": "...", "count": 정수 }]
}`;

const EMPTY: ReviewTips = { sampleSize: 0, risks: [], questions: [], keywords: [] };

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

interface RawTips {
  risks?: { text?: string; freq?: number }[];
  questions?: { text?: string; freq?: number }[];
  keywords?: { term?: string; count?: number }[];
}

/** gpt 응답(JSON)을 ReviewTips로 안전 변환 — 스키마 이탈 항목은 버린다 */
function toReviewTips(raw: RawTips, sampleSize: number): ReviewTips {
  const tips = (arr: { text?: string; freq?: number }[] | undefined) =>
    (arr ?? [])
      .filter((x): x is { text: string; freq?: number } => typeof x.text === "string" && x.text.trim() !== "")
      .map((x) => ({ text: x.text.trim(), freq: typeof x.freq === "number" ? x.freq : undefined }));
  const kws = (raw.keywords ?? [])
    .filter((x): x is { term: string; count?: number } => typeof x.term === "string" && x.term.trim() !== "")
    .map((x) => ({ term: x.term.trim(), count: typeof x.count === "number" ? x.count : 1 }));
  return { sampleSize, risks: tips(raw.risks), questions: tips(raw.questions), keywords: kws };
}

/**
 * 유사 풀의 qna 요약을 검수 팁으로 묶는다.
 * qna 요약이 있는 프로젝트가 없으면 빈 ReviewTips(sampleSize 0)를 돌려준다 — 화면에서 숨겨진다.
 */
export async function mergeReviewTips(pool: PoolQna[]): Promise<ReviewTips> {
  // 실제로 리스크·질문·키워드 중 하나라도 있는 프로젝트만 표본으로 센다
  const useful = pool.filter(
    (p) => p.riskSignals.length || p.keyQuestions.length || p.keywords.length,
  );
  if (useful.length === 0) return EMPTY;

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const body = useful
    .map((p, i) => {
      const parts = [`[프로젝트 ${i + 1}] ${p.title}`];
      if (p.riskSignals.length) parts.push(`리스크: ${p.riskSignals.join(" / ")}`);
      if (p.keyQuestions.length) parts.push(`질문: ${p.keyQuestions.join(" / ")}`);
      if (p.keywords.length) parts.push(`키워드: ${p.keywords.join(", ")}`);
      return parts.join("\n");
    })
    .join("\n\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `유사 프로젝트 ${useful.length}건:\n\n${body}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`검수 팁 요청 실패: ${res.status}`);

  const j = (await res.json()) as ChatResponse;
  const out = j.choices?.[0]?.message?.content;
  if (!out) return EMPTY;
  return toReviewTips(JSON.parse(out) as RawTips, useful.length);
}
