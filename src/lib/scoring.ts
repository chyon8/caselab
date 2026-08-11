// 검수 스코어링 (테스트) — 러프한 고객 의뢰 인풋을 받아 SCORING_SPEC의 12개 내부 섹션별로
// confidence(0~100) + 파악된 내용 + 부족한 것(=통화에서 물어볼 것)을 뽑는다.
//
// 역할 분담(NEXT_STEPS 관통 원칙): 판단(각 섹션이 얼마나 채워졌나)만 LLM이 하고,
// 산수(가중 총점, 필수섹션 게이트)는 코드가 결정적으로 계산한다.
// 저장하지 않는다 — 인풋을 넣을 때 즉석 생성(공고문 검색과 같은 stateless 흐름).

/**
 * 스코어링·추측 모델 — 4o-mini → gpt-5.5 상향 (2026-08-11, 사용자 지시).
 * 추측(guess)이 4o-mini에선 분야 지식이 얕아 뻔한 소리만 나오던 게 상향 사유다(실측).
 * ★ gpt-5 계열은 temperature를 안 받는다(기본값 1만 허용, 다른 값이면 400).
 *   그래서 아래 요청에 temperature가 없다. 모델을 4o 계열로 되돌리면 다시 넣어야 한다.
 */
const MODEL = "gpt-5.5";

/**
 * 추론 강도. **Vercel Free 티어의 60초 함수 한계 때문에 고른 값이다.**
 * 실측(2026-08-11, 항공 하드웨어 의뢰 — 12섹션 전량 + 추측): 기본 49.0초 / low 37.7초 / none 29.8초.
 * 기본값이면 인풋이 조금만 길어져도 504가 난다. 세 값 모두 추측 품질에 눈에 띄는 차이가 없어
 * (셋 다 ARINC·DO-160·COM Express 급의 고유명사를 냈다) 여유가 가장 큰 none을 쓴다.
 * ★ 지원값은 모델마다 다르다 — gpt-5.5는 none/low/medium/high/xhigh이고 'minimal'은 400을 낸다.
 */
const REASONING_EFFORT = "none";

/**
 * SCORING_SPEC 2절: 12개 내부 섹션, 가중치 합 100%. required=게이트 필수(공고를 못 쓰는 핵심).
 *
 * naAllowed=false인 섹션은 **해당없음이 될 수 없다.** 어떤 프로젝트든 목적·기능·플랫폼·예산·일정·산출물은
 * 존재하기 때문 — 고객이 안 적었을 뿐이면 confidence가 낮은 것이지 "해당 안 되는" 게 아니다.
 * LLM이 "인풋에 없음"을 해당없음으로 밀어붙이는 걸 프롬프트로만 막으면 새므로 코드가 강제한다.
 *
 * guessAllowed=false인 섹션은 **추측을 채우지 않는다.**
 *   - 목적·핵심문제: 고객만 아는 고유 사실이라 지어내면 통화가 틀린 전제로 시작된다.
 *   - 예산·일정: 금액·기간은 estimate.ts가 코드로 결정적으로 계산하는 영역이다(판단/계산 분리).
 *     LLM이 여기서 따로 추측하면 견적 패널과 두 개의 숫자가 생긴다.
 */
export const SECTIONS: {
  id: string;
  label: string;
  weight: number;
  required: boolean;
  naAllowed: boolean;
  guessAllowed: boolean;
}[] = [
  { id: "purpose", label: "프로젝트 목적/개요", weight: 15, required: true, naAllowed: false, guessAllowed: false },
  { id: "core_problem", label: "핵심 문제/현재 운영방식", weight: 10, required: false, naAllowed: true, guessAllowed: false },
  { id: "features", label: "사용자 핵심 기능", weight: 20, required: true, naAllowed: false, guessAllowed: true },
  { id: "admin", label: "관리자 기능", weight: 10, required: true, naAllowed: true, guessAllowed: true },
  { id: "users", label: "타겟 사용자/규모", weight: 5, required: false, naAllowed: true, guessAllowed: true },
  { id: "platform", label: "플랫폼/개발 범위(웹·앱·신규·고도화)", weight: 10, required: true, naAllowed: false, guessAllowed: true },
  { id: "integrations", label: "외부 연동", weight: 5, required: false, naAllowed: true, guessAllowed: true },
  { id: "design", label: "디자인 범위", weight: 5, required: false, naAllowed: true, guessAllowed: true },
  { id: "tech_stack", label: "기술 스택/인프라", weight: 5, required: false, naAllowed: false, guessAllowed: true },
  { id: "budget", label: "예산", weight: 5, required: false, naAllowed: false, guessAllowed: false },
  { id: "timeline", label: "일정", weight: 5, required: false, naAllowed: false, guessAllowed: false },
  { id: "deliverables", label: "산출물/자격요건/우대사항", weight: 5, required: false, naAllowed: false, guessAllowed: true },
];

/** 게이트 통과 임계 confidence — 필수 섹션이 전부 이 값 이상이면 "공고 작성 가능". 튜닝 대상. */
const GATE_THRESHOLD = 60;

/**
 * 추측은 **게이트를 못 넘는 섹션**(confidence < GATE_THRESHOLD)에만 붙인다.
 * "공고에 쓸 만큼 안 채워졌다"는 판정선을 게이트와 공유한다 — 기준이 둘로 갈리면 어긋난다.
 * 이미 충분히 적힌 섹션에 추측을 얹으면 무엇이 사실이고 무엇이 짐작인지 흐려진다.
 *
 * ★ 이 임계값을 프롬프트에는 알리지 않는다. 1차 실행에서 "50 이하일 때만 추측"이라고 알려줬더니
 *   4개 섹션이 전부 confidence 51로 나왔다(경계 회피). 판정은 코드가 한다 — acceptsNa와 같은 철학.
 */
const guessable = (confidence: number) => confidence < GATE_THRESHOLD;

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
  /**
   * 인풋에 없어서 비어 있는 섹션을, 이 분야라면 보통 어떻게 되는지 **추측**으로 채운 것(0~3개).
   * summary와 정반대다 — summary는 인풋에 있는 것만, guess는 인풋에 없는 것만.
   * ★ 총점·게이트에는 절대 들어가지 않는다. 추측으로 점수가 오르면 부실한 공고가 게이트를 통과한다.
   */
  guess: string[];
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

/** 추측을 채울 수 있는 섹션 id — 위와 같은 이유로 SECTIONS에서 뽑는다 */
const GUESS_ALLOWED_IDS = SECTIONS.filter((s) => s.guessAllowed)
  .map((s) => s.id)
  .join(", ");

/**
 * 프롬프트에 자명성 금지의 "나쁜 예"로 쓴 문장들.
 * LLM은 프롬프트의 예시 문장을 결과에 그대로 실어 보낸다(미팅 추출 1차 실행에서 실측).
 * "예시를 베끼지 마라"는 문구는 통제수단이 못 되므로 출력에서 코드가 걷어낸다.
 */
const GUESS_EXAMPLES = ["요구사항 정의 필요", "일정 협의 필요", "품질 관리 필요", "예산 확정 필요"];

/**
 * 프롬프트 JSON 예시에 **어투 견본**으로 넣은 문구. 그대로 복사돼 오면 걷어낸다.
 * ★ 위와 달리 포함관계가 아니라 **완전 일치**로 비교한다 — "…가 따라오는 편"은 정상 추측에도 붙는
 *   어미라, 포함관계로 걸면 "지도 SDK가 따라오는 편" 같은 멀쩡한 항목까지 죽는다.
 */
const GUESS_SHAPE = ["보통 … 하는 경우가 많다", "…가 따라오는 편"];

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
- guess: 아래 【추측】 규칙대로 채운다. 해당 없으면 빈 배열.

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

【추측(guess) — 비어 있는 섹션을 분야 통념으로 채운다】
공고가 부실해 비어 있는 섹션에 **이 분야·이 유형의 프로젝트라면 실제로 어떻게 되는지**를 담는다.
매니저가 통화 전에 "아마 이런 얘기가 나오겠구나"를 미리 잡는 용도다.

★★ summary와 **정반대 방향**이다. summary는 인풋에 있는 것만, guess는 **인풋에 없는 것만.**
   고객이 이미 쓴 말을 되풀이하면 아무것도 알려주지 않는다.
★★ **정보가 없는 섹션일수록 반드시 채워라.** confidence가 0인 섹션을 빈 배열로 넘기는 것은
   이 항목의 존재 이유를 없애는 것이다. 정보가 없어서 못 쓰는 게 아니라, **없으니까 쓰는 것**이다.
   반대로 인풋에 이미 충분히 적혀 있는 섹션은 빈 배열로 둔다 — 아는 걸 짐작할 이유가 없다.
★★ guess를 채울 수 있는 섹션은 오직 이것뿐이다: ${GUESS_ALLOWED_IDS}
   나머지(목적·핵심문제·예산·일정)는 무조건 빈 배열. 고객만 아는 사실이거나 별도 견적이 담당한다.

- **구체적으로.** 이 분야에서 실제로 쓰이는 형태·규격·부품·표준·인증·산출물 종류·연동 방식을 짚어라.
  분야에 맞는 것을 꺼내라 — 하드웨어면 폼팩터·회로·인증·시험, 앱/웹이면 서버·연동·스토어 심사,
  AI면 학습 데이터·모델. 위는 예시일 뿐이니 이 의뢰가 속한 분야의 것을 꺼내라.
- 【★ 이름을 대라 — 이 항목의 유일한 합격 기준】 규격·표준·프로토콜·부품·인증·문서의 **고유명사**를
  대야 한다. 이름을 못 대겠으면 **그 항목은 아예 쓰지 마라.** 빈 배열이 뻔한 소리보다 낫다.
- 【섹션 이름 되풀이 금지】 섹션 이름을 문장으로 늘려 쓴 것은 답이 아니다. 아무것도 알려주지 않는다.
  · 나쁜 예: 관리자 기능 → "운영자 백오피스가 필요할 가능성이 있다"
  · 나쁜 예: 외부 연동 → "외부 API 연동이 요구될 수 있다"
  · 나쁜 예: 산출물 → "개발된 결과물과 관련 문서가 포함될 가능성이 있다"
  이 섹션에서 **이 분야라면 구체적으로 무엇인지**를 이름으로 써라.
- 【자명성 금지】 아무 프로젝트에나 해당하는 말(${GUESS_EXAMPLES.join(" / ")} 따위)은 쓰지 마라.
  "높은 신뢰성이 요구된다", "성능이 중요하다" 같은 말도 같다. 안 쓰느니만 못하다.
- 【확정 금지】 인풋에 근거가 없으니 단정하지 마라. "보통 …로 간다", "…가 따라오는 편",
  "…일 가능성이 높다" 처럼 짐작임이 문장에서 드러나야 한다.
- 섹션당 1~3개, 한 줄씩. 왜 그렇게 보는지가 짧게 붙으면 좋다.

그리고 12섹션 어디에도 안 걸리지만 놓치면 안 되는 것(예: "6월 오픈 필수", 특수 규제, 이해관계자 언급)은 notes에 담는다.

한국어. 아래 JSON으로만 답한다. sections는 반드시 위 12개 id를 모두 포함한다(해당없음도 빼지 말고 applicable=false로).
{
  "sections": [
    { "id": "purpose", "applicable": true, "confidence": 0, "summary": "...", "naEvidence": "", "guess": [] },
    { "id": "admin", "applicable": true, "confidence": 0, "summary": "", "naEvidence": "", "guess": ["보통 … 하는 경우가 많다", "…가 따라오는 편"] }
  ],
  "notes": ["..."]
}`;

interface RawSection {
  id?: string;
  applicable?: boolean;
  naEvidence?: string;
  confidence?: number;
  summary?: string;
  guess?: unknown;
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

/**
 * summary 정리 — 프롬프트 JSON 예시의 자리표시자("...")를 LLM이 그대로 실어 보내는 일이 있다
 * (2026-08-11 실측: 정보가 0인 섹션이 많은 인풋에서 여러 섹션의 summary가 통째로 "..."로 왔다).
 * 화면에 "..."이 요약인 척 뜨므로 빈 값으로 되돌린다.
 */
function cleanSummary(v: unknown): string {
  const s = typeof v === "string" ? v.trim() : "";
  return /^[.…]+$/.test(s) ? "" : s;
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
 * 추측(guess)을 인정할지 코드가 결정한다.
 * ①추측이 허용된 섹션이고 ②해당되는 섹션이며 ③아직 게이트를 못 넘는 섹션일 때만 남긴다.
 * 자명한 문장(프롬프트의 나쁜 예)은 걷어낸다 — LLM이 프롬프트 예시를 그대로 실어 보내기 때문.
 *
 * ★ 인풋 대조는 걸지 않는다. 이건 "이 프로젝트에 대한 주장"이 아니라 "이 분야면 보통 이렇다"는
 *   일반 지식이라 원문에 없는 게 당연하다(2026-08-07 브리핑에서 배운 것 — 분야 지식에 근거 대조를
 *   걸었더니 항목 자체가 나올 수 없게 됐다). 실패 모드가 "틀린 사실"이 아니라 "뻔한 소리"라
 *   자명성 규칙으로 다룬다.
 */
function acceptedGuesses(
  guessAllowed: boolean,
  applicable: boolean,
  confidence: number,
  raw: RawSection | undefined,
): string[] {
  if (!guessAllowed || !applicable || !guessable(confidence)) return [];
  if (!Array.isArray(raw?.guess)) return [];
  return raw.guess
    .map((g) => (typeof g === "string" ? g.trim() : ""))
    .filter((g) => g !== "")
    .filter((g) => {
      const s = squash(g);
      if (GUESS_SHAPE.some((ex) => s === squash(ex))) return false;
      return !GUESS_EXAMPLES.some((ex) => s.includes(squash(ex)) || squash(ex).includes(s));
    })
    .slice(0, 3);
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
    const confidence = applicable ? clamp(r?.confidence) : 0;
    return {
      id: meta.id,
      label: meta.label,
      weight: meta.weight,
      required: meta.required,
      applicable,
      confidence,
      summary: cleanSummary(r?.summary),
      guess: acceptedGuesses(meta.guessAllowed, applicable, confidence, r),
    };
  });

  // 가중 총점(0~100) — 해당없음을 뺀 나머지 가중치로 재정규화(전부 해당되면 가중치 합 100 = 기존과 동일)
  // ★ guess는 여기 안 들어간다. 추측으로 총점이 오르면 부실한 공고가 게이트를 통과해버린다.
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
      model: MODEL,
      store: true,
      reasoning_effort: REASONING_EFFORT,
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
