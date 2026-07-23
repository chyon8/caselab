// 확인 질문 생성 (테스트) — 러프 인풋을 받아, 검수 매니저가 고객 통화에서 물어볼 질문을 뽑는다.
// 스코어링(12섹션)과 독립. 오직 두 목적에만 복무한다: ①업무 범위 구체화 ②신뢰할 만한 견적.
// 유사사례/검수팁을 재료로 쓰지 않는다 — 다른 프로젝트 얘기가 섞이면 오염되므로 이 인풋만 본다.

/** 질문 생성 모델 — 4o로 올렸다가 mini로 다시 내림(퀄리티 비교용). */
const MODEL = "gpt-4o-mini";

export interface AskQuestion {
  text: string;
  /** 이 질문이 무엇을 위한 것인가 */
  purpose: "범위" | "견적" | "둘다";
}

const PROMPT = `너는 위시켓 "검수 매니저"를 돕는 어시스턴트다.
고객이 보낸 정리되지 않은 개발 외주 의뢰를 받아, 매니저가 고객과 통화할 때 확인할 질문을 뽑는다.
질문은 오직 두 가지 목적에만 복무한다:
1. 업무 범위 구체화 — 무엇을 만들고 무엇을 빼는지, 기능의 깊이·수량 등 범위를 가르는 지점
2. 견적 산정 — 공수(M/D)를 크게 바꾸는 미정 요소(기능 수량, 연동 난이도, 디자인 유무, 신규/고도화 등)

절대 규칙:
0. 【자명성 금지】 "요구사항을 명확히", "일정을 확정" 같은 아무 프로젝트에나 되는 질문은 절대 금지.
   이 의뢰에서만 나오는 구체적인 질문만.
1. 인풋에 근거한다. 없는 사실을 지어내지 마라. 단, 이 유형이면 반드시 필요한데 고객이 안 밝힌
   숨은 요소(관리자 백오피스, 결제·정산, 푸시 알림, 회원등급 등)는 "이것도 포함인가요?"로 물어도 된다.
2. 견적·범위를 크게 흔드는 것부터. 사소한 것보다 공수를 좌우하는 결정 포인트를 우선한다.
3. 고객이 바로 답할 수 있는 구체적인 문장으로 쓴다.
4. 최대 8개. 못 미치면 적게. 중요한 것만 남긴다.

각 질문에 purpose를 붙인다: "범위" | "견적" | "둘다".
한국어. 아래 JSON으로만 답한다.
{ "questions": [ { "text": "...", "purpose": "범위" } ] }`;

interface RawQuestion {
  text?: string;
  purpose?: string;
}
interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

const PURPOSES = new Set(["범위", "견적", "둘다"]);

/** 러프 인풋으로 확인 질문 목록을 생성한다. */
export async function generateQuestions(text: string): Promise<AskQuestion[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      store: true,
      temperature: 0.3,
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
      // 상태코드만 남긴다
    }
    throw new Error(`질문 생성 실패 (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const j = (await res.json()) as ChatResponse;
  const out = j.choices?.[0]?.message?.content;
  if (!out) return [];
  const parsed = JSON.parse(out) as { questions?: RawQuestion[] };
  return (parsed.questions ?? [])
    .filter((q): q is { text: string; purpose?: string } => typeof q.text === "string" && q.text.trim() !== "")
    .map((q) => ({
      text: q.text.trim(),
      purpose: (PURPOSES.has(q.purpose ?? "") ? q.purpose : "범위") as AskQuestion["purpose"],
    }));
}
