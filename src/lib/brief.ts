// 프로젝트 브리핑 (테스트) — 러프 인풋을 "원문을 다 안 읽어도 파악되는" 형태로 압축한다.
// 스코어링(12섹션)과 목적이 다르다: 스코어링은 "얼마나 적혀있나"(완성도)를 재고, 이건 "그래서 뭔데"에 답한다.
// 질문은 여기서 내지 않는다 — questions.ts가 전담한다(중복 방지).
//
// ★ 근거 대조는 "이 프로젝트에 대한 주장"에만 건다(wants). 원문에 없는 사실을 지어내는 걸 막는 것이고,
//   scoring.ts의 acceptsNa와 같은 원칙이다 — 프롬프트로 "지어내지 마라"는 LLM이 안 지키면 그만이라
//   검증 가능한 조건으로 바꾼 것.
//   반대로 concepts(알아야 할 개념)에는 대조를 걸지 않는다. 그건 이 프로젝트에 대한 주장이 아니라
//   분야 일반 지식이고, **고객이 언급하지 않은 것을 꺼내오는 게 존재 이유**이기 때문이다
//   (하드웨어 의뢰에 PCB·펌웨어·외형설계처럼). 대조를 걸면 그 기능이 통째로 죽는다.
//   concepts의 실패 모드는 "틀린 사실"이 아니라 "뻔한 소리"라, 자명성 금지 규칙으로 다룬다.

const MODEL = "gpt-4o-mini";

export interface BriefConcept {
  /** 개념 이름 (고객이 안 쓴 말이어도 된다) */
  term: string;
  /** 이게 뭔지 + 이 프로젝트에서 왜 걸리는지 */
  plain: string;
}

export interface BriefWant {
  text: string;
  /** 이 판단의 근거가 된 원문 조각 */
  evidence: string;
  /** 원문에 직접 쓰여 있지 않고 추론한 것이면 true → 화면에 "추측"으로 표시 */
  inferred: boolean;
}

export interface BriefResult {
  /** 한 줄 정의 */
  oneLiner: string;
  /** 핵심 3~5개 */
  points: string[];
  concepts: BriefConcept[];
  wants: BriefWant[];
}

const PROMPT = `너는 위시켓 "검수 매니저"를 돕는 어시스턴트다.
고객이 보낸 정리되지 않은 개발 외주 의뢰를 받아, 매니저가 **원문을 다 읽지 않아도** 파악할 수 있게 압축한다.

내야 할 것 4가지:
1. oneLiner — 이 프로젝트가 뭔지 한 줄로. "무엇을 위한 무엇을 만드는 프로젝트"
2. points — 핵심 3~5개. 이것만 읽어도 되게. 사소한 건 빼고 중요한 것만.
3. concepts — 이 의뢰를 **실제로 만들려면 필요한 기술 요소**. 매니저가 상담 전에 알아야 할 것.

   ★ 【기능 되풀이 금지 — 이 항목에서 가장 흔한 실패】
   고객이 요청한 **기능 이름을 다시 풀어 쓰는 것은 답이 아니다.** 아무것도 알려주지 않는다.
   - 나쁜 예: "자동 타이머 기능 — 사용자가 설정한 시간에 따라 자동으로 종료하는 기능"
   - 나쁜 예: "출력 강도 조절 — 출력의 강도를 조절하는 기능"
   이런 건 절대 쓰지 마라. 고객이 이미 아는 내용이다.

   대신 그 기능을 **구현하려면 무엇이 필요한지**를 써라 — 부품·소자·회로·소재·공정·인증·연동·인프라.
   · 하드웨어/기기: 핵심 소자(트랜스듀서·센서·모터 등), 구동 회로와 PCB 설계, MCU 펌웨어,
     전원·배터리, 외형(기구) 설계와 금형, 방수·발열, 인증(전파적합성·의료기기 등), 시제품 vs 양산
   · 앱/웹: 서버·API, DB 설계, 인증, 결제 PG 연동, 푸시, 스토어 심사, 인프라·트래픽
   · AI: 학습 데이터 확보, 모델 선택·파인튜닝, 추론 비용, 정확도 기준
   · 위는 예시다. 이 의뢰가 속한 분야에 맞는 것을 꺼내라.

   - 각 항목: 그게 뭔지 + **이 프로젝트에서 무엇이 갈리는지/왜 문제가 되는지** 한두 문장.
   - 【자명성 금지】 "요구사항 정의", "일정 관리", "품질 관리", "예산 확정"처럼 아무 프로젝트에나
     해당하는 말도 금지.
   - 4~8개.
4. wants — 고객이 결국 원하는 것. 표면 요구만이 아니라 그 뒤의 목적까지.
   - 각 항목에 evidence(근거가 된 **원문 문장을 그대로 인용**)를 반드시 붙인다.
   - 원문에 직접 쓰여 있으면 inferred=false, 네가 추론한 것이면 inferred=true.
   - 인용을 지어내지 마라. 원문에 없는 문장을 evidence 로 쓰면 그 항목은 통째로 버려진다.

절대 규칙:
- oneLiner·points·wants 는 **인풋에 없는 사실(기능·기간·금액·조건)을 지어내지 마라.**
  고객이 말하지 않은 걸 말한 것처럼 쓰면 안 된다.
- concepts 는 반대다. **고객이 말하지 않은 것을 꺼내오는 항목**이다. 다만 이 의뢰에서 실제로
  논의될 것이어야 하고, 아무 데나 되는 뻔한 말이면 안 된다.
- 추론은 해도 되지만 반드시 inferred=true 로 표시하고 근거를 인용해라.
- 질문은 내지 마라. 그건 다른 곳에서 한다.

한국어. 아래 JSON으로만 답한다.
{
  "oneLiner": "...",
  "points": ["...", "..."],
  "concepts": [ { "term": "...", "plain": "..." } ],
  "wants": [ { "text": "...", "evidence": "...", "inferred": false } ]
}`;

interface RawBrief {
  oneLiner?: unknown;
  points?: unknown;
  concepts?: { term?: unknown; plain?: unknown }[];
  wants?: { text?: unknown; evidence?: unknown; inferred?: unknown }[];
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

/**
 * 인용문 대조용 — 공백·문장부호 차이로 어긋나지 않게 다듬는다.
 * scoring.ts의 squash와 같은 규칙. 그쪽을 건드리지 않으려고 여기에 따로 둔다.
 */
function squash(s: string): string {
  return s.toLowerCase().replace(/[\s.,!?~"'`()[\]{}·…-]/g, "");
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * LLM 응답에 코드 가드를 걸어 최종 브리핑을 만든다.
 * - wants: evidence 가 인풋에 실재해야 한다. 너무 짧은 인용은 우연히 걸리므로 기각.
 * - concepts: 대조하지 않는다. 원문에 없는 개념을 꺼내오는 게 목적이라 대조하면 기능이 죽는다.
 */
export function assembleBrief(raw: RawBrief, inputText: string): BriefResult {
  const hay = squash(inputText);

  // 용어가 인풋에 그대로 있으면 버린다 — 고객이 쓴 기능 이름을 되풀이하며 설명하는 실패를 막는다
  // ("자동 타이머 기능 = 시간에 맞춰 꺼지는 기능" 류. 인터뷰형 인풋의 선택지가 특히 잘 새어든다).
  // wants의 근거 대조와는 정반대 방향이다: 저긴 원문에 있어야 통과, 여긴 원문에 있으면 탈락.
  // 대가로 "1.3MHz"처럼 고객이 쓴 용어 자체의 풀이는 막히지만, 그건 다른 표현
  // ("초음파 주파수와 침투 깊이")으로 쓰면 통과한다.
  const concepts = (raw.concepts ?? [])
    .map((c) => ({ term: str(c.term), plain: str(c.plain) }))
    .filter((c) => c.term !== "" && c.plain !== "")
    .filter((c) => !hay.includes(squash(c.term)));

  const wants = (raw.wants ?? [])
    .map((w) => ({
      text: str(w.text),
      evidence: str(w.evidence),
      inferred: w.inferred === true,
    }))
    .filter((w) => w.text !== "")
    .filter((w) => {
      const quote = squash(w.evidence);
      return quote.length >= 6 && hay.includes(quote);
    });

  return {
    oneLiner: str(raw.oneLiner),
    points: (Array.isArray(raw.points) ? raw.points : []).map(str).filter((p) => p !== ""),
    concepts,
    wants,
  };
}

/** 러프 인풋으로 브리핑을 만든다. */
export async function briefInput(text: string): Promise<BriefResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

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
    throw new Error(`브리핑 생성 실패 (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const j = (await res.json()) as ChatResponse;
  const out = j.choices?.[0]?.message?.content;
  if (!out) return { oneLiner: "", points: [], concepts: [], wants: [] };
  return assembleBrief(JSON.parse(out) as RawBrief, text);
}
