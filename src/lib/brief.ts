// 프로젝트 브리핑 (테스트) — 러프 인풋을 "원문을 다 안 읽어도 파악되는" 형태로 압축한다.
// 스코어링(12섹션)과 목적이 다르다: 스코어링은 "얼마나 적혀있나"(완성도)를 재고, 이건 "그래서 뭔데"에 답한다.
// 질문은 여기서 내지 않는다 — questions.ts가 전담한다(중복 방지).
//
// ★ 용어 해설(terms)과 기술 요소(concepts)는 **인풋 대조 방향이 정반대**다. 코드가 그걸로 가른다.
//   - terms: 고객이 쓴 말을 풀어주는 항목 → 용어가 인풋에 **있어야** 통과.
//     ("1.3MHz"의 MHz가 뭔지, 왜 3MHz를 1MHz로 바꾸려는지 — 매니저가 모르는 건 고객이 쓴 말 쪽이다.)
//   - concepts: 고객이 언급하지 않은 것을 꺼내오는 게 존재 이유 → 인풋에 **없어야** 통과.
//     (하드웨어 의뢰에 트랜스듀서·임피던스 매칭·인증처럼.)
//   방향을 안 가르면 하나로 뭉쳐 둘 다 죽는다: 예전엔 concepts 하나뿐이라 "인풋에 있으면 탈락"만
//   걸려 있었고, 그래서 MHz·출력 같은 핵심 용어 해설이 코드에 막혀 나올 수 없었다.
//   두 항목의 실패 모드도 다르다 — terms는 "기능 이름 되풀이"(자동 타이머 = 시간 맞춰 꺼지는 기능),
//   concepts는 "뻔한 소리". 앞은 코드로, 뒤는 자명성 금지 규칙으로 다룬다.

const MODEL = "gpt-4o-mini";

export interface BriefTerm {
  /** 고객이 쓴 용어·수치·단위 그대로 */
  term: string;
  /** 그게 뭔지 + 이 프로젝트에서 왜 그 값인지/무엇이 갈리는지 */
  plain: string;
}

export interface BriefConcept {
  /** 개념 이름 (고객이 안 쓴 말이어도 된다) */
  term: string;
  /** 이게 뭔지 + 이 프로젝트에서 왜 걸리는지 */
  plain: string;
}

export interface BriefResult {
  /** 한 줄 정의 */
  oneLiner: string;
  /** 핵심 3~5개 */
  points: string[];
  terms: BriefTerm[];
  concepts: BriefConcept[];
}

const PROMPT = `너는 위시켓 "검수 매니저"를 돕는 어시스턴트다.
고객이 보낸 정리되지 않은 개발 외주 의뢰를 받아, 매니저가 **원문을 다 읽지 않아도** 파악할 수 있게 압축한다.

【인풋 형태 주의】 인터뷰형 인풋에는 "선택 옵션: ['A','B','C']" 처럼 **보기 목록**이 딸려 있다.
그건 시스템이 제시한 보기일 뿐 고객의 요구가 아니다. 고객이 **자기 말로 답한 문장과, 그중 실제로
고른 것만** 요구로 취급해라. 고객이 안 고른 보기, 고객이 다른 걸 골라 **배제한 보기**를 요구·기능으로
옮기면 없는 프로젝트를 그리게 된다.

내야 할 것 4가지:
1. oneLiner — 이 프로젝트가 뭔지 한 줄로. "무엇을 위한 무엇을 만드는 프로젝트"
2. points — 핵심 3~5개. 이것만 읽어도 되게. 사소한 건 빼고 중요한 것만.
3. terms — 고객이 쓴 말 중 **매니저가 모를 용어·수치·단위**를 풀어준다.
   매니저는 이 분야 비전문가다. 고객이 "1.3MHz", "출력", "EMS", "벌크"라고 쓰면 그게 뭔지 모른다.

   - 대상: 고객이 실제로 쓴 도메인 용어·수치·단위·부품명·업계 은어. **인풋에 그 말이 있어야 한다.**
   - 각 항목: 그게 뭔지 + **이 프로젝트에서 왜 그 값인지 / 무엇이 갈리는지.**
     · 좋은 예: "3MHz → 1MHz — 초음파 주파수. 낮을수록 침투가 깊어 심부용, 높을수록 표피용이다.
       주파수를 바꾸면 진동자·정합 회로를 다시 잡아야 한다."
     · 나쁜 예: "1MHz — 1메가헤르츠" (단위만 풀어쓴 것. 왜 중요한지가 없다)
   - 【기능 이름 금지】 "자동 타이머 기능", "출력 강도 조절 기능"처럼 **고객이 붙인 기능 이름은 대상이
     아니다.** 그건 매니저도 읽으면 안다. 물리량·부품·단위·업계 용어만.
   - 풀어줄 게 없으면 빈 배열로 둬라. 억지로 채우지 마라. 0~6개.
4. concepts — 이 의뢰를 **실제로 만들려면 필요한 기술 요소**. 매니저가 상담 전에 알아야 할 것.

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
   - **terms 와 겹치지 마라.** 고객이 쓴 말은 terms, 고객이 안 쓴 말이 concepts 다.

절대 규칙:
- oneLiner·points 는 **인풋에 없는 사실(기능·기간·금액·조건)을 지어내지 마라.**
  고객이 말하지 않은 걸 말한 것처럼 쓰면 안 된다.
- concepts 는 반대다. **고객이 말하지 않은 것을 꺼내오는 항목**이다. 다만 이 의뢰에서 실제로
  논의될 것이어야 하고, 아무 데나 되는 뻔한 말이면 안 된다.
- 질문은 내지 마라. 그건 다른 곳에서 한다.

한국어. 아래 JSON으로만 답한다.
{
  "oneLiner": "...",
  "points": ["...", "..."],
  "terms": [ { "term": "...", "plain": "..." } ],
  "concepts": [ { "term": "...", "plain": "..." } ]
}`;

interface RawBrief {
  oneLiner?: unknown;
  points?: unknown;
  terms?: { term?: unknown; plain?: unknown }[];
  concepts?: { term?: unknown; plain?: unknown }[];
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
 * 두 목록의 대조 방향이 정반대다(파일 상단 주석 참조) — terms 는 인풋에 있어야, concepts 는 없어야 통과.
 */
export function assembleBrief(raw: RawBrief, inputText: string): BriefResult {
  const hay = squash(inputText);
  const pair = (c: { term?: unknown; plain?: unknown }) => ({
    term: str(c.term),
    plain: str(c.plain),
  });
  const filled = (c: BriefTerm) => c.term !== "" && c.plain !== "";

  // terms: 고객이 실제로 쓴 말만 — 인풋에 없는 용어를 풀이하면 그건 concepts 의 몫이다.
  // "기능"이 들어간 용어는 버린다: 고객이 붙인 기능 이름을 되풀이하는 실패가 여기서 제일 흔한데
  //   ("자동 타이머 기능 = 시간에 맞춰 꺼지는 기능"), 그건 매니저도 읽으면 아는 내용이다.
  const terms = (raw.terms ?? [])
    .map(pair)
    .filter(filled)
    .filter((c) => hay.includes(squash(c.term)))
    .filter((c) => !c.term.includes("기능"));

  // concepts: 인풋에 그대로 있으면 버린다 — 고객이 안 쓴 것을 꺼내오는 게 이 항목의 존재 이유라
  // 인풋에 있는 말이 올라왔다는 건 terms 와 섞였다는 뜻이다.
  const concepts = (raw.concepts ?? [])
    .map(pair)
    .filter(filled)
    .filter((c) => !hay.includes(squash(c.term)));

  return {
    oneLiner: str(raw.oneLiner),
    points: (Array.isArray(raw.points) ? raw.points : []).map(str).filter((p) => p !== ""),
    terms,
    concepts,
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
      // 상태코드만 남긴다
    }
    throw new Error(`브리핑 생성 실패 (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const j = (await res.json()) as ChatResponse;
  const out = j.choices?.[0]?.message?.content;
  if (!out) return { oneLiner: "", points: [], terms: [], concepts: [] };
  return assembleBrief(JSON.parse(out) as RawBrief, text);
}
