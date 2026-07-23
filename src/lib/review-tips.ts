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
  /** 기술 쟁점 — 근거가 실려 있어 팁이 일반론으로 뭉개지는 걸 막는 재료다 */
  technicalNotes: string[];
  keywords: string[];
}

const PROMPT = `너는 위시켓 프로젝트 "검수 매니저"를 돕는 컨설팅 어시스턴트다.
지금 검수 중인 공고와 의미상 유사했던 과거 프로젝트 N건의 요약을 받는다.
목표: 이 유형을 검수할 때 "미리 확인·확정해야 할 핵심"을 압축해 준다. 나열이 아니라 통찰이다.

절대 규칙:
0. 【자명성 금지 — 가장 중요】 "어느 개발 프로젝트에나 해당되는 말"은 절대 쓰지 마라.
   검수 매니저는 이미 프로다. 당연한 말을 보면 이 도구를 신뢰하지 않게 된다.
   한 항목을 쓸 때마다 자문하라: "이걸 아무 프로젝트에나 갖다 붙여도 말이 되는가?"
   말이 되면 버려라. 이 유형에서만 나오는 구체적인 내용으로 바꾸거나, 없으면 아예 빼라.
   반드시 버릴 예시 (이런 류는 전부 금지):
   - "요구사항/기능 범위를 명확히 정의해야 함"
   - "일정 및 주요 마일스톤을 사전에 확정해야 함"
   - "예산과 기간이 타이트한 조건에서 구현 가능성 확인"
   - "커뮤니케이션 방식을 합의해야 함", "산출물 범위를 명확히 해야 함"
   좋은 예시 (구체적이라 살릴 것):
   - "관리자 직접 수정 범위를 CMS 수준으로 볼지 텍스트 교체 수준으로 볼지 확정 — 견적 차이가 큼"
   - "Hero 배경 동영상은 모바일 자동재생 정책(iOS muted+playsinline) 때문에 대안 합의 필요"
1. 강하게 통합한다. 워딩만 다르고 본질이 같은 것은 반드시 하나로 묶는다.
   개별 프로젝트의 문장을 그대로 복사하지 말고, 여러 건을 관통하는 공통 주제로 승격시킨다.
   단, 통합하다가 일반론으로 뭉개지면 실패다 — 규칙 0이 규칙 1보다 우선한다.
   구체성을 잃느니 차라리 통합하지 말고 그 항목을 버려라.
   단, technical은 통합하지 않는다 — 근거가 실린 서술이라 뭉치면 근거가 사라진다(규칙 9).
2. 각 섹션은 최대 개수를 넘기지 않는다: technical 6개, risks 6개, questions 6개, keywords 12개.
   많이 나열하지 말고, 가장 반복되고 중요한 것만 남긴다. 못 미치면 적게 내도 된다.
   **0개도 정상이다.** 건질 게 없으면 빈 배열을 내라. 채우려고 일반론을 지어내지 마라.
3. freq/count = 그 주제가 나타난 서로 다른 프로젝트 수(정수). freq 높은 순 정렬.
4. risks: "무엇을 확인/대비해야 하는지" 행동 지시형. (예: "결제·정산 방식과 환불 규정을 계약 전 확정")
5. questions: 개별 질문 나열이 아니라, 이 유형에서 반복적으로 "미리 확정해야 하는 결정 포인트"로 묶는다.
   (예: 흩어진 결제 질문들 → "결제 방식(전액/예약금/현장) 및 PG·정산 구조 확정")
6. keywords: 같은 개념은 하나로 합치고(예: "다국어"와 "다국어 지원"은 하나), 중복 출력 금지.
7. 입력에 실제로 있는 내용만. 없는 것 지어내지 않기. 없으면 빈 배열.
8. 【지금 검수 중인 공고와의 관련성】 유사 사례는 의미가 가까울 뿐 같은 프로젝트가 아니다.
   지금 공고에 적용될 여지가 없는 항목은 아무리 구체적이어도 버려라.
   (예: 웹사이트 구축 공고인데 "중국 앱 마켓 등록 지연", "앱스토어 심사 반려" 같은 앱 전용 리스크)
   공고가 명시적으로 제외한 것도 버려라 (예: "결제 기능 불필요"라고 적혀 있으면 결제 관련 항목 제외).
9. 【technical — 입력의 "기술쟁점" 항목】 개발사가 근거를 대며 짚은 기술적 제약·실현가능성·대안 구현을
   질문으로 바꾸지 말고 근거를 살려 서술형으로 남긴다. 여러 건의 기술쟁점이 같은 주제라도 억지로
   하나로 합치지 말고 근거가 다르면 따로 남긴다(단, 문자 그대로 같은 내용의 중복만 제거).
   나쁜 예(근거 잘림): "영상을 이어붙이는 형태인지?"
   좋은 예(근거 유지): "30~60초 영상은 API 직접 생성 불가 — 짧은 클립 이어붙이기가 유일한 방법이나 토큰 소모가 큼"
한국어. 아래 JSON으로만 답한다.

{
  "technical":  [{ "text": "...", "freq": 정수 }],
  "risks":      [{ "text": "...", "freq": 정수 }],
  "questions":  [{ "text": "...", "freq": 정수 }],
  "keywords":   [{ "term": "...", "count": 정수 }]
}`;

const EMPTY: ReviewTips = {
  sampleSize: 0,
  technicalNotes: [],
  risks: [],
  questions: [],
  keywords: [],
};

/**
 * freq 뱃지를 다는 최소 건수. 이 미만이면 항목은 그대로 보여주되 "N건" 표기만 뗀다.
 *
 * ⚠️ freq를 필터로 쓰면 안 된다 — 실측에서 정확히 거꾸로 걸러졌다.
 * 자명성 금지 규칙을 넣은 뒤 나온 출력을 보면, 값진 항목일수록 freq가 낮다:
 *   freq=1 "카페24 빌더호스팅 사용 시 디자인 구현의 어려움"  ← 살려야 할 것
 *   freq=1 "기술 스택(GSAP, ScrollTrigger)에 대한 클라이언트 동의 필요"  ← 살려야 할 것
 *   freq=5 "요구사항을 명확히 정의해야 함"  ← 버려야 할 것
 * 구체적인 것은 드물고, 일반론은 여러 건에 걸쳐 뭉개지며 빈도를 얻는다.
 * 그래서 품질은 프롬프트(규칙 0)가 잡고, freq는 "몇 건에서 반복됐다"는 부가 정보로만 쓴다.
 * 1건짜리에 "1건"을 달면 근거가 빈약해 보이므로 숫자만 뗀다.
 */
const MIN_FREQ_SHOWN = 2;

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

interface RawTips {
  technical?: { text?: string; freq?: number }[];
  risks?: { text?: string; freq?: number }[];
  questions?: { text?: string; freq?: number }[];
  keywords?: { term?: string; count?: number }[];
}

/** gpt 응답(JSON)을 ReviewTips로 안전 변환 — 스키마 이탈 항목은 버린다 */
function toReviewTips(raw: RawTips, sampleSize: number): ReviewTips {
  const tips = (arr: { text?: string; freq?: number }[] | undefined) =>
    (arr ?? [])
      .filter((x): x is { text: string; freq?: number } => typeof x.text === "string" && x.text.trim() !== "")
      .map((x) => ({
        text: x.text.trim(),
        // MIN_FREQ_SHOWN 미만이면 뱃지를 떼고 내용만 남긴다(UI는 freq가 없으면 숫자를 안 그린다)
        freq: typeof x.freq === "number" && x.freq >= MIN_FREQ_SHOWN ? x.freq : undefined,
      }));
  const kws = (raw.keywords ?? [])
    .filter((x): x is { term: string; count?: number } => typeof x.term === "string" && x.term.trim() !== "")
    .map((x) => ({ term: x.term.trim(), count: typeof x.count === "number" ? x.count : 1 }));
  return {
    sampleSize,
    technicalNotes: tips(raw.technical),
    risks: tips(raw.risks),
    questions: tips(raw.questions),
    keywords: kws,
  };
}

/**
 * 유사 풀의 qna 요약을 검수 팁으로 묶는다.
 * qna 요약이 있는 프로젝트가 없으면 빈 ReviewTips(sampleSize 0)를 돌려준다 — 화면에서 숨겨진다.
 * @param posting 지금 검수 중인 공고(정규화본). 이게 없으면 모델이 관련성을 판단할 수 없어
 *   무관한 사례의 리스크(앱 전용 이슈 등)가 그대로 섞여 나온다.
 */
export async function mergeReviewTips(pool: PoolQna[], posting: string): Promise<ReviewTips> {
  // 실제로 리스크·질문·키워드 중 하나라도 있는 프로젝트만 표본으로 센다
  const useful = pool.filter(
    (p) =>
      p.riskSignals.length || p.keyQuestions.length || p.technicalNotes.length || p.keywords.length,
  );
  if (useful.length === 0) return EMPTY;

  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const body = useful
    .map((p, i) => {
      const parts = [`[프로젝트 ${i + 1}] ${p.title}`];
      if (p.technicalNotes.length) parts.push(`기술쟁점: ${p.technicalNotes.join(" / ")}`);
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
      store: true,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        {
          role: "user",
          content:
            `=== 지금 검수 중인 공고 ===\n${posting.slice(0, 3000)}\n\n` +
            `=== 의미상 유사했던 과거 프로젝트 ${useful.length}건 ===\n${body}`,
        },
      ],
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const errBody = (await res.json()) as { error?: { message?: string; type?: string; code?: string } };
      detail = errBody.error?.message ?? errBody.error?.code ?? errBody.error?.type ?? "";
    } catch {
      // OpenAI 에러 응답이 JSON이 아닌 경우(드묾) — 상태코드만 남긴다
    }
    throw new Error(`검수 팁 요청 실패 (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const j = (await res.json()) as ChatResponse;
  const out = j.choices?.[0]?.message?.content;
  if (!out) return EMPTY;
  return toReviewTips(JSON.parse(out) as RawTips, useful.length);
}
