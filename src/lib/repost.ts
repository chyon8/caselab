// 러프 인풋을 위시켓 "공고 양식"(SCORING_SPEC.md §1 기준)으로 재배치한다.
// ★ 내용은 절대 바꾸지 않는다 — 원문 워딩 그대로, 어느 문장이 어느 섹션인지 위치만 나눈다.
//   (요약·재작성·번역·윤문·창작 금지) 원문에 없는 섹션은 "없음 · 확인 필요"로 둔다.
//   추천 제목·키워드처럼 생성이 필요한 항목도 지금은 재배치 대상이 아니라 "없음 · 확인 필요".

/** 없는 섹션 표기 — 원문에 근거 없으면 이 문구를 body로 둔다 */
export const REPOST_MISSING = "없음 · 확인 필요";

/** 공고 양식 섹션 제목 — 고정 순서. LLM은 원문 조각을 이 제목들 아래로만 옮긴다. */
export const REPOST_HEADINGS = [
  "추천 공고문 제목",
  "프로젝트 키워드",
  "프로젝트 개요",
  "프로젝트 배경 및 목표",
  "과업 범위",
  "기술/제조 스택",
  "클라이언트 준비 사항",
  "주요 일정",
  "개발 기간",
  "지원 자격 및 우대 사항",
  "산출물",
  "계약 관련 특이 사항",
] as const;

export interface RepostSection {
  heading: string;
  /** 이 섹션에 배치된 원문 조각(그대로). 없으면 REPOST_MISSING. */
  body: string;
}

export interface RepostResult {
  sections: RepostSection[];
}

interface RawRepost {
  sections?: { heading?: string; body?: string }[];
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

const PROMPT = `너는 위시켓 "검수 매니저"를 돕는 어시스턴트다.
고객이 보낸 정리되지 않은 개발 외주 의뢰 인풋을, 아래 위시켓 공고 양식으로 "재배치"만 한다.

★★ 절대 규칙 ★★
- 원문의 워딩을 그대로 쓴다. 문장을 요약·재작성·번역·윤문·창작하지 마라.
- 없는 내용을 지어내지 마라. 원문에 실제로 있는 조각만 옮긴다.
- 각 문장/구절이 어느 섹션에 속하는지 판단해 그 섹션에 원문 그대로 넣는다.
- 원문에 근거가 전혀 없는 섹션은 body를 정확히 "없음 · 확인 필요" 로 둔다.
- "추천 공고문 제목", "프로젝트 키워드"는 새로 지어내는 항목이므로, 원문에 명시적 제목/키워드가 없으면 "없음 · 확인 필요".
- 한 섹션에 여러 조각이 가면 원문 순서대로 줄바꿈(\\n)으로 이어 붙인다.

섹션(heading은 아래 목록 그대로, 이 순서로 12개 전부 반환):

1. "추천 공고문 제목" — 원문에 제목이 있으면 그대로, 없으면 "없음 · 확인 필요".
2. "프로젝트 키워드" — 원문에 키워드가 있으면 그대로, 없으면 "없음 · 확인 필요".
3. "프로젝트 개요" — 프로젝트명/한 줄 정의.
4. "프로젝트 배경 및 목표" — 왜 만드는지, 현재 운영방식, 목표(서술형 원문).
5. "과업 범위" — body를 아래 하위 구조로 채운다(원문 조각 그대로, 없는 항목은 "없음 · 확인 필요"):
   1. 수행 범위
   - 상세 기획: ...
   - UI/UX 디자인: ...
   - 프런트엔드/Client 개발: ...
   - 백엔드 개발: ...
   - 서버/DB/인프라 구성: ...
   2. 상세 기능 요구 사항
      2-1. (모듈명): (세부 기능 원문)
      2-2. ...
   3. 비기능적 요구사항
      3-1. 성능/규격: ...
      3-2. 보안/인증: ...
6. "기술/제조 스택" — 요구 기술·인프라.
7. "클라이언트 준비 사항" — 제공 문서/자료, 투입 인력·조직.
8. "주요 일정" — 희망 착수일, 주요 마일스톤, 최종 오픈(납품) 희망일.
9. "개발 기간" — 총 개발 소요 기간(일정과 별개). 원문에 있으면 그대로.
10. "지원 자격 및 우대 사항" — 지원 자격, 우대 사항.
11. "산출물" — 납품물 목록.
12. "계약 관련 특이 사항" — 예산, 부품/조립비 별도 협의 등 서술형.

반드시 아래 JSON 형식으로만 답한다:
{ "sections": [ { "heading": "프로젝트 개요", "body": "원문 조각 그대로" }, ... ] }`;

function assemble(raw: RawRepost): RepostResult {
  const byHeading = new Map<string, string>();
  for (const s of raw.sections ?? []) {
    const h = (s.heading ?? "").trim();
    const b = (s.body ?? "").trim();
    if (h) byHeading.set(h, b);
  }
  // 고정 제목·순서로 정규화 — 빠지거나 빈 섹션은 "없음 · 확인 필요"로
  const sections: RepostSection[] = REPOST_HEADINGS.map((heading) => {
    const b = byHeading.get(heading) ?? "";
    return { heading, body: b === "" ? REPOST_MISSING : b };
  });
  return { sections };
}

/** 러프 인풋을 공고 양식으로 재배치한다(워딩 불변). */
export async function repostInput(text: string): Promise<RepostResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      store: true,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `고객 의뢰 인풋:\n"""\n${text.slice(0, 12000)}\n"""` },
      ],
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      detail = err.error?.message ?? "";
    } catch {
      // OpenAI 에러 응답이 JSON이 아닌 드문 경우 — 상태코드만 남긴다
    }
    throw new Error(`공고문 재배치 요청 실패 (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const j = (await res.json()) as ChatResponse;
  const out = j.choices?.[0]?.message?.content;
  if (!out) throw new Error("공고문 재배치 결과가 비어 있습니다.");
  return assemble(JSON.parse(out) as RawRepost);
}
