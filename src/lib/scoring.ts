// 검수 스코어링 (테스트) — 러프한 고객 의뢰 인풋을 받아 SCORING_SPEC의 12개 내부 섹션별로
// confidence(0~100) + 파악된 내용 + 부족한 것(=통화에서 물어볼 것)을 뽑는다.
//
// 역할 분담(NEXT_STEPS 관통 원칙): 판단(각 섹션이 얼마나 채워졌나)만 LLM이 하고,
// 산수(가중 총점, 필수섹션 게이트)는 코드가 결정적으로 계산한다.
// 저장하지 않는다 — 인풋을 넣을 때 즉석 생성(공고문 검색과 같은 stateless 흐름).

/**
 * SCORING_SPEC 2절: 12개 내부 섹션, 가중치 합 100%. required=게이트 필수(공고를 못 쓰는 핵심).
 *
 * naAllowed=false인 섹션은 **해당없음이 될 수 없다.** 어떤 프로젝트든 목적·기능·플랫폼·예산·일정·산출물은
 * 존재하기 때문 — 고객이 안 적었을 뿐이면 confidence가 낮은 것이지 "해당 안 되는" 게 아니다.
 * LLM이 "인풋에 없음"을 해당없음으로 밀어붙이는 걸 프롬프트로만 막으면 새므로 코드가 강제한다.
 */
export const SECTIONS: {
  id: string;
  label: string;
  weight: number;
  required: boolean;
  naAllowed: boolean;
}[] = [
  { id: "purpose", label: "프로젝트 목적/개요", weight: 15, required: true, naAllowed: false },
  { id: "core_problem", label: "핵심 문제/현재 운영방식", weight: 10, required: false, naAllowed: true },
  { id: "features", label: "사용자 핵심 기능", weight: 20, required: true, naAllowed: false },
  { id: "admin", label: "관리자 기능", weight: 10, required: true, naAllowed: true },
  { id: "users", label: "타겟 사용자/규모", weight: 5, required: false, naAllowed: true },
  { id: "platform", label: "플랫폼/개발 범위(웹·앱·신규·고도화)", weight: 10, required: true, naAllowed: false },
  { id: "integrations", label: "외부 연동", weight: 5, required: false, naAllowed: true },
  { id: "design", label: "디자인 범위", weight: 5, required: false, naAllowed: true },
  { id: "tech_stack", label: "기술 스택/인프라", weight: 5, required: false, naAllowed: false },
  { id: "budget", label: "예산", weight: 5, required: false, naAllowed: false },
  { id: "timeline", label: "일정", weight: 5, required: false, naAllowed: false },
  { id: "deliverables", label: "산출물/자격요건/우대사항", weight: 5, required: false, naAllowed: false },
];

/** 게이트 통과 임계 confidence — 필수 섹션이 전부 이 값 이상이면 "공고 작성 가능". 튜닝 대상. */
const GATE_THRESHOLD = 60;

export interface SectionScore {
  id: string;
  label: string;
  weight: number;
  required: boolean;
  /**
   * 이 프로젝트에 애초에 해당되는 섹션인가. false = 해당없음(항목 자체가 존재하지 않음).
   * "정보가 없다"(=confidence 낮음)와는 다르다. false면 총점·게이트에서 제외한다.
   */
  applicable: boolean;
  /** 0~100. applicable=false면 0(총점에서 빠지므로 의미 없음) */
  confidence: number;
  /** 인풋에서 이 섹션에 대해 파악된 내용 요약(원문 안 읽고 훑기용). 해당없음이면 그 판단 근거. 없으면 "" */
  summary: string;
}

export interface ScoreResult {
  sections: SectionScore[];
  /** 12섹션 어디에도 안 걸리지만 놓치면 안 되는 것(마감 급함, 특수 제약 등) */
  notes: string[];
  /** 가중 총점 0~100. 해당없음 섹션을 뺀 나머지 가중치로 재정규화 — 해당없다고 점수가 깎이지 않는다 */
  total: number;
  gate: { pass: boolean; blocking: string[] };
}

/** 해당없음을 줄 수 있는 섹션 id — 프롬프트와 코드가 같은 목록을 보게 SECTIONS에서 뽑는다 */
const NA_ALLOWED_IDS = SECTIONS.filter((s) => s.naAllowed)
  .map((s) => s.id)
  .join(", ");

const PROMPT = `너는 위시켓 "검수 매니저"를 돕는 어시스턴트다.
고객이 보낸 정리되지 않은 개발 외주 의뢰 인풋을 받아, 아래 12개 섹션 각각이
"개발사가 추가 미팅 없이 견적을 낼 수 있는 공고문"을 쓰기에 얼마나 충분히 채워졌는지 평가한다.

각 섹션마다:
- applicable: true/false. 이 섹션이 이 프로젝트에 **애초에 해당되는가**. 기본값은 true다.
  ★★★ false는 **고객이 "그건 필요 없다"고 직접 말한 경우에만** 준다.
     정보가 없는 것 ≠ 해당없음. 인풋에 그 얘기가 아예 없으면 **무조건 true에 confidence 0**이다.
     예) 웹사이트/앱 개발 의뢰에 관리자 기능 얘기가 없다 → 대부분 필요한 기능이므로 true, confidence 0.
        "관리자 페이지는 없어도 됩니다" 같은 말이 있을 때만 false.
     예) 현재 운영방식 얘기가 없다 → true, confidence 0.
        "지금은 아무것도 없고 처음부터 새로 만듭니다" 같은 말이 있을 때만 false.
  ★★ false를 줄 수 있는 섹션은 오직 이것뿐이다: ${NA_ALLOWED_IDS}
     나머지(목적·기능·플랫폼·기술스택·예산·일정·산출물)는 무조건 true.
- naEvidence: applicable=false일 때만 채운다. 그렇게 판단한 근거가 되는 **인풋 원문 문장을 그대로 복사**한다
  (요약·의역·재작성 금지, 원문에 있는 글자 그대로). 그런 문장을 못 찾겠으면 applicable을 true로 바꿔라.
  ※ 인용문이 원문에 실제로 없으면 시스템이 해당없음 판정을 버린다.
- confidence: 0~100 정수. 이 섹션을 공고에 쓸 수 있는 정도. (applicable=false면 무시되므로 0)
  0~20  = 거의 단서 없음("앱 만들어주세요" 수준)
  21~50 = 대략적 방향만, 핵심 결정 불명확
  51~80 = 웬만큼 파악됨, 일부 확인 필요
  81~100 = 공고에 바로 쓸 만큼 구체적
- summary: 인풋에서 이 섹션에 대해 실제로 파악된 내용을 1~2줄로 요약. 없으면 "".
  applicable=false면 왜 해당없다고 봤는지 한 줄로 적는다.
  ★ 인풋에 실제로 있는 내용만. 지어내지 마라. 이게 매니저가 원문을 안 읽고 훑는 근거다.

12개 섹션(id: 설명):
- purpose: 프로젝트 목적/개요 — 무엇을 왜 만드나
- core_problem: 핵심 문제/현재 운영방식 — 지금 어떻게 하고 있고 뭐가 불편한가
- features: 사용자 핵심 기능 — 실제 사용자가 쓰는 기능 명세
- admin: 관리자 기능 — 운영자 백오피스
- users: 타겟 사용자/규모
- platform: 플랫폼/개발 범위 — 웹/앱/PC, 신규/고도화
- integrations: 외부 연동 — 결제, 지도, 알림톡, 외부 API 등
- design: 디자인 범위 — 시안 유무, 디자인 포함 여부
- tech_stack: 기술 스택/인프라 (없으면 "개발사 제안"도 유효 정보)
- budget: 예산
- timeline: 일정
- deliverables: 산출물/자격요건/우대사항

그리고 12섹션 어디에도 안 걸리지만 놓치면 안 되는 것(예: "6월 오픈 필수", 특수 규제, 이해관계자 언급)은 notes에 담는다.

한국어. 아래 JSON으로만 답한다. sections는 반드시 위 12개 id를 모두 포함한다(해당없음도 빼지 말고 applicable=false로).
{
  "sections": [
    { "id": "purpose", "applicable": true, "confidence": 0, "summary": "...", "naEvidence": "" }
  ],
  "notes": ["..."]
}`;

interface RawSection {
  id?: string;
  applicable?: boolean;
  naEvidence?: string;
  confidence?: number;
  summary?: string;
}
interface RawScore {
  sections?: RawSection[];
  notes?: string[];
}
interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

function clamp(n: unknown): number {
  const v = typeof n === "number" ? n : 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** 인용문 대조용 — 공백·문장부호 차이로 어긋나지 않게 다듬는다 */
function squash(s: string): string {
  return s.toLowerCase().replace(/[\s.,!?~"'`()[\]{}·…-]/g, "");
}

/**
 * 해당없음(applicable=false)을 인정할지 코드가 결정한다.
 * 조건: ①해당없음이 가능한 섹션이고 ②LLM이 명시적으로 false를 줬고
 *      ③고객이 "필요 없다"고 말한 원문을 인용했고 ④그 인용문이 실제 인풋에 있어야 한다.
 * ③④가 핵심 — 프롬프트로 "정보 없음을 해당없음으로 쓰지 마라"고 해도 LLM이 계속 어겨서
 * (예: 웹사이트 개발 의뢰인데 관리자 기능을 해당없음 처리) 검증 가능한 조건으로 바꿨다.
 */
function acceptsNa(naAllowed: boolean, raw: RawSection | undefined, inputText: string): boolean {
  if (!naAllowed || raw?.applicable !== false) return false;
  const quote = squash(raw.naEvidence ?? "");
  if (quote.length < 6) return false; // 너무 짧은 인용은 우연히 걸리므로 안 받는다
  return squash(inputText).includes(quote);
}

/**
 * LLM 응답(판단)에 가중치를 붙이고 총점·게이트를 코드가 결정적으로 계산한다.
 * inputText는 해당없음 인용문을 대조하는 데 쓴다(원문에 없는 인용은 해당없음을 기각).
 */
export function assembleScore(raw: RawScore, inputText: string): ScoreResult {
  const byId = new Map<string, RawSection>();
  for (const s of raw.sections ?? []) if (s.id) byId.set(s.id, s);

  const sections: SectionScore[] = SECTIONS.map((meta) => {
    const r = byId.get(meta.id);
    const applicable = !acceptsNa(meta.naAllowed, r, inputText);
    return {
      id: meta.id,
      label: meta.label,
      weight: meta.weight,
      required: meta.required,
      applicable,
      confidence: applicable ? clamp(r?.confidence) : 0,
      summary: typeof r?.summary === "string" ? r.summary.trim() : "",
    };
  });

  // 가중 총점(0~100) — 해당없음을 뺀 나머지 가중치로 재정규화(전부 해당되면 가중치 합 100 = 기존과 동일)
  const scored = sections.filter((s) => s.applicable);
  const weightSum = scored.reduce((sum, s) => sum + s.weight, 0);
  const total =
    weightSum === 0
      ? 0
      : Math.round(scored.reduce((sum, s) => sum + s.confidence * s.weight, 0) / weightSum);

  // 해당없는 필수 섹션은 게이트를 막지 않는다(관리자 기능이 없는 프로젝트를 "정보 부족"으로 막던 문제)
  const blocking = sections
    .filter((s) => s.required && s.applicable && s.confidence < GATE_THRESHOLD)
    .map((s) => s.label);

  const notes = (raw.notes ?? []).filter((n): n is string => typeof n === "string" && n.trim() !== "");

  return { sections, notes, total, gate: { pass: blocking.length === 0, blocking } };
}

/** 러프 인풋을 12섹션 스코어로 평가한다. */
export async function scoreInput(text: string): Promise<ScoreResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

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
        { role: "user", content: `고객 의뢰 인풋:\n"""\n${text}\n"""` },
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
    throw new Error(`스코어링 요청 실패 (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const j = (await res.json()) as ChatResponse;
  const out = j.choices?.[0]?.message?.content;
  if (!out) throw new Error("스코어링 결과가 비어 있습니다.");
  return assembleScore(JSON.parse(out) as RawScore, text);
}
