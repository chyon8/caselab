// 공고문 draft — 의뢰 원문 + 매니저가 고른 통화 녹취를 합쳐 공고문 초안을 쓴다.
//
// repost.ts(재배치)와 뭐가 다른가:
//   repost — 원문 워딩 **불변**. 위치만 공고 양식으로 옮긴다. 원문 대조용.
//   draft  — 구어체를 공고 문장으로 **다듬어도 된다**(사용자 결정). 대신 원문·녹취에 없는
//            사실(기능·기간·금액·조건)은 절대 만들지 않는다.
// 섹션 제목·순서는 repost와 **같은 것을 재사용**한다 — 둘을 나란히 놓고 비교하는 게 목적이라
// 양식이 갈라지면 안 된다.

import { REPOST_HEADINGS, REPOST_MISSING, type RepostSection } from "./repost";

const MODEL = "gpt-4o-mini";

/** 통화 한 건 중 draft 재료로 쓰는 부분 */
export interface DraftCall {
  summary: string | null;
  transcript: string | null;
  created_at: string | null;
}

export interface DraftResult {
  sections: RepostSection[];
}

/** 통화 한 건이 프롬프트에 차지할 수 있는 최대 길이 — 10분 통화면 수천 자라 그대로 넣으면 비용·정확도가 나빠진다 */
const CALL_CHARS = 4000;

const PROMPT = `너는 위시켓 "검수 매니저"를 돕는 어시스턴트다.
재료 두 가지를 받아 위시켓 공고 양식으로 **공고문 초안**을 쓴다.
  ① 고객이 처음 보낸 의뢰 원문
  ② 매니저가 고객과 통화한 녹취 (시간순) — 검수 통화에서 확정된 내용이 여기 있다

★★ 절대 규칙 ★★
- **없는 사실을 만들지 마라.** 기능·기간·금액·조건·기술스택은 ①이나 ②에 실제로 나온 것만 쓴다.
  그럴듯해 보여도 재료에 없으면 쓰지 않는다.
- 근거가 전혀 없는 섹션은 body를 정확히 "${REPOST_MISSING}" 로 둔다. 억지로 채우지 마라.
- **워딩은 다듬어도 된다.** 구어체·말끝흐림을 공고에 어울리는 문장으로 정리해라
  ("결제도 앱에서 하고요" → "앱 내 결제 기능 제공"). 요약·정리는 되지만 **내용 추가는 안 된다.**
- ②에서 확정된 내용이 ①과 다르면 **②를 따른다.** 통화가 더 나중이고 확정된 정보다.
  (예: 원문엔 "관리자 페이지 필요"인데 통화에서 "관리자 페이지는 필요 없다"고 했으면 빼거나 제외로 쓴다)
- ②에서 고객이 명시적으로 **필요 없다고 한 것**은 넣지 마라.
- 아직 정해지지 않은 것을 정해진 것처럼 쓰지 마라. 미정이면 그 섹션은 "${REPOST_MISSING}".

섹션(heading은 아래 목록 그대로, 이 순서로 12개 전부 반환):
${REPOST_HEADINGS.map((h, i) => `${i + 1}. "${h}"`).join("\n")}

- "추천 공고문 제목"·"프로젝트 키워드"는 재료를 바탕으로 **지어도 된다**(공고 등록에 필요한 항목).
  단 재료에 없는 도메인·기술을 끌어오지 마라.
- "과업 범위"는 만들어야 할 기능·작업 항목 전부. 재료에 그런 내용이 하나라도 있으면 절대 "${REPOST_MISSING}"로 두지 않는다.
- "프로젝트 배경 및 목표"에는 왜 만드는지·현재 운영방식·목표만. 기능 설명은 "과업 범위"로 보낸다.

반드시 아래 JSON 형식으로만 답한다:
{ "sections": [ { "heading": "프로젝트 개요", "body": "..." }, ... ] }`;

interface RawDraft {
  sections?: { heading?: string; body?: string }[];
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

/** 고정 제목·순서로 정규화 — 빠지거나 빈 섹션은 "없음 · 확인 필요"로 (repost의 assemble과 같은 규칙) */
export function assembleDraft(raw: RawDraft): DraftResult {
  const byHeading = new Map<string, string>();
  for (const s of raw.sections ?? []) {
    const h = (s.heading ?? "").trim();
    const b = (s.body ?? "").trim();
    if (h) byHeading.set(h, b);
  }
  const sections: RepostSection[] = REPOST_HEADINGS.map((heading) => {
    const b = byHeading.get(heading) ?? "";
    return { heading, body: b === "" ? REPOST_MISSING : b };
  });
  return { sections };
}

/** 통화 녹취를 프롬프트 재료 문자열로 — 요약이 있으면 요약도 같이 준다(핵심이 압축돼 있다) */
function callsBlock(calls: DraftCall[]): string {
  return calls
    .map((c, i) => {
      const when = c.created_at ? ` (${c.created_at})` : "";
      const parts = [`--- 통화 ${i + 1}${when} ---`];
      if (c.summary) parts.push(`[요약] ${c.summary}`);
      if (c.transcript) parts.push(`[녹취] ${c.transcript.slice(0, CALL_CHARS)}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

/** 의뢰 원문 + 선택 녹취로 공고문 초안을 만든다. */
export async function draftPosting(text: string, calls: DraftCall[]): Promise<DraftResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const material =
    `① 고객 의뢰 원문:\n"""\n${text.slice(0, 12000)}\n"""\n\n` +
    (calls.length > 0
      ? `② 검수 통화 녹취 (${calls.length}건, 시간순):\n"""\n${callsBlock(calls)}\n"""`
      : "② 통화 녹취: 없음");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      store: true,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: material },
      ],
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      detail = err.error?.message ?? "";
    } catch {
      // 상태코드만 남긴다
    }
    throw new Error(`공고문 draft 생성 실패 (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const j = (await res.json()) as ChatResponse;
  const out = j.choices?.[0]?.message?.content;
  if (!out) return assembleDraft({});
  return assembleDraft(JSON.parse(out) as RawDraft);
}
