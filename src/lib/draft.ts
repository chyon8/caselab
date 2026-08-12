// 공고문 draft — 의뢰 원문 + 매니저가 고른 통화 녹취를 합쳐 공고문 초안을 쓴다.
//
// repost.ts(재배치)와 뭐가 다른가:
//   repost — 원문 워딩 **불변**. 위치만 공고 양식으로 옮긴다. 원문 대조용.
//   draft  — 구어체를 공고 문장으로 **다듬어도 된다**(사용자 결정). 대신 원문·녹취에 없는
//            사실(기능·기간·금액·조건)은 절대 만들지 않는다.
// 섹션 제목·순서는 repost와 **같은 것을 재사용**한다 — 둘을 나란히 놓고 비교하는 게 목적이라
// 양식이 갈라지면 안 된다.

import { REPOST_HEADINGS, REPOST_MISSING, type RepostSection } from "./repost";

/**
 * 공고문 draft 모델 — 4o → gpt-5.5 상향 (2026-08-12, 사용자 지시).
 * ★ gpt-5 계열은 temperature를 안 받는다(기본값 1만 허용, 다른 값이면 400).
 *   그래서 아래 요청에 temperature가 없다. 모델을 4o 계열로 되돌리면 다시 넣어야 한다.
 */
const MODEL = "gpt-5.5";

/**
 * 추론 강도 — scoring.ts와 같은 이유로 none. draft는 11개 섹션을 전부 쓰느라 출력이 길어
 * Vercel 60초(maxDuration) 안에 들어와야 한다. 품질이 아쉬우면 low→medium으로 올리되
 * 실제 소요 시간을 재고 올려라(초과하면 504).
 * ★ gpt-5.5 지원값: none/low/medium/high/xhigh ('minimal'은 400).
 */
const REASONING_EFFORT = "none";

/** 통화 한 건 중 draft 재료로 쓰는 부분 */
export interface DraftCall {
  summary: string | null;
  transcript: string | null;
  created_at: string | null;
}

export interface DraftResult {
  sections: RepostSection[];
}

// 인풋은 자르지 않는다 — 의뢰 원문도 녹취도 **전량** 넣는다(사용자 결정, 2026-08-07).
// 원래 녹취에 4,000자 상한이 있었는데, 7분 통화가 4,965자로 나와 뒤 20%(산출물·인수인계 논의)가
// 잘려나가고 있었다. 검수 통화는 10분을 넘기도 해서 상한을 두면 결정적인 대목이 조용히 사라진다.
// 비용보다 누락이 비싸다.

const PROMPT = `너는 20년 경력의 **수석 IT/하드웨어 제조 컨설턴트**다.
재료 두 가지를 받아 위시켓 공고 양식으로 **개발사가 바로 견적을 낼 수 있는 공고문 초안**을 쓴다.
  ① 고객이 처음 보낸 의뢰 원문
  ② 매니저가 고객과 통화한 녹취 (시간순) — 검수 통화에서 확정된 내용이 여기 있다

고객은 이 분야 비전문가라 필요한 걸 다 적지 못한다. **너는 그 빈칸을 전문가로서 메운다.**
재료를 그대로 옮겨 적는 것은 네 일이 아니다. 이 제품을 실제로 만들려면 무엇이 필요한지를
전문 지식으로 풀어, 개발사가 읽고 공수를 산정할 수 있는 수준으로 구체화해라.

★★ 확장 규칙 — 어디까지 채워도 되는가 ★★
- **채워도 되는 것**: 작업 항목, 상세 기능·스펙, 산출물, 지원 자격·우대 사항, 준비 자료.
  재료의 요구를 구현하려면 당연히 따라오는 것들을 전문 지식으로 도출해라.
  (예: "PCB 설계" 요구 → 발진·구동 회로 설계, PCB 레이아웃, 시제품 제작·출력 테스트,
   회로도·거버 파일·테스트 보고서 같은 산출물이 따라온다)
- **채우면 안 되는 것**: 금액, 기간, 날짜, 수량, 규격 수치. 이것들은 재료에 나온 값만 쓴다.
  재료에 없으면 그 줄을 생략한다. **통화 옆에 붙은 날짜는 통화 시각일 뿐 착수일·납품일이 아니다.**
- **재료와 모순되면 안 된다.** 고객이 "없다/필요 없다/이미 되어 있다"고 한 것을 과업으로 넣지 마라.
- 고객이 언급하지 않았지만 이 유형에 필수인 것을 넣을 때는, 재료의 요구에서 **논리적으로 도출되는
  것**만 넣어라. 있으면 좋을 법한 부가 기능을 상상해 끼워 넣는 것은 금지다(견적이 부풀려진다).

★★ 그 외 규칙 ★★
- 【선택 옵션 주의】 ①이 인터뷰형이면 "선택 옵션: ['A','B','C']" 같은 **보기 목록**이 섞여 있다.
  그건 시스템이 제시한 보기일 뿐 고객의 요구가 아니다. 고객이 **자기 말로 답한 것과 실제로 고른
  것만** 요구로 취급한다. 고객이 다른 걸 골라 **배제한 보기**를 기능으로 옮기지 마라.
- ②에서 확정된 내용이 ①과 다르면 **②를 따른다.** 통화가 더 나중이고 확정된 정보다.
- 구어체·말끝흐림은 공고에 어울리는 문장으로 정리한다 ("결제도 앱에서 하고요" → "앱 내 결제 기능 제공").
- 근거도 없고 도출도 안 되는 섹션만 body를 정확히 "${REPOST_MISSING}" 로 둔다.
- **하드웨어 프로젝트라면** 부품 구매·조립 비용(BOM)은 용역비와 별도 협의임을 "계약 관련 특이 사항"에 명시한다.

★★ 표기 규칙 ★★
- 볼드체(**), 이탤릭체(*) 등 **마크다운 서식을 절대 쓰지 마라.** 오직 텍스트와 하이픈(-), 숫자(1.)만.
- 기능·항목 나열은 **반드시 하이픈(-) 리스트**로 쓴다. 줄글·문장형 나열 금지.
- 여러 항목이 같은 서술을 반복하면 하나로 묶어라.
  (나쁜 예: "상태 전달, 전압 전달, 전류 전달" → 좋은 예: "상태·전압·전류 정보를 수신하여 전달")
- 【축약 금지】 "기본적인 ~ 기능", "~ 등"처럼 뭉뚱그리지 마라. 항목을 하나하나 풀어 쓴다.
- 【분량】 "상세 기능 요구 사항"은 모듈 2개 이상, 모듈마다 항목 3개 이상. 각 항목은
  "이름: 설명" 꼴로, 개발사가 무엇을 만들어야 하는지 알 수 있게 쓴다. 한 단어로 끝내지 마라.

섹션(heading은 아래 목록 그대로, 이 순서로 ${REPOST_HEADINGS.length}개 전부 반환). body는 각 섹션의
양식대로 작성한다 — 양식의 하위 번호·들여쓰기를 그대로 지켜라:

1. "추천 공고문 제목" — 후보 2개를 하이픈 리스트로.
2. "프로젝트 키워드" — 키워드 3~5개를 쉼표로 이어 한 줄.
3. "프로젝트 개요" — 프로젝트명 한 줄.
4. "프로젝트 배경 및 목표" — 서술형. 왜 만드는지·현재 상황·목표만. 기능 설명은 "과업 범위"로 보낸다.
5. "과업 범위" — 아래 3단 구조를 그대로 쓴다. 재료에 기능·작업 내용이 하나라도 있으면 절대 "${REPOST_MISSING}"로 두지 않는다.
   1. 수행 범위
   - (이 프로젝트에서 수행할 작업 종류를 하이픈 리스트로. 예: 회로 설계, PCB 아트워크, 펌웨어 개발,
     시제품 제작 / 또는 상세 기획, UI/UX 디자인, 프런트엔드 개발, 백엔드 개발, 서버·DB·인프라 구성)
   - **고객이 "이미 되어 있다"·"필요 없다"·"그건 문제 없다"·"그대로 간다"고 말한 것은 빠짐없이
     "제외:" 로 명시한다.** ②를 훑어 그런 말이 나온 대목을 전부 찾아라. 개발사가 견적을 내려면
     무엇을 안 해도 되는지가 무엇을 해야 하는지만큼 중요하고, 범위 분쟁은 여기서 난다.
     (예: "제외: 외형(기구) 설계 — 기존 금형 사용", "제외: 앱·블루투스 연동 없음")
   2. 상세 기능 요구 사항
      2-1. (모듈/기능군 이름)
      - (세부 기능·스펙): (설명)
      2-2. (모듈/기능군 이름)
      - (세부 기능·스펙): (설명)
   3. 비기능적 요구사항
      3-1. 성능/규격: (재료에 있는 수치·규격. 없으면 이 줄을 생략)
      3-2. 보안/인증: (KC인증 등 재료에 언급된 것. 없으면 이 줄을 생략)
6. "기술/제조 스택" — 재료에 명시된 기술·부품·환경. 없으면 "${REPOST_MISSING}".
7. "클라이언트 준비 사항" — 아래 구조.
   1. 문서 및 자료
   - (고객이 제공하기로 한 것)
   2. 투입 인력 및 조직
   - (고객 측 담당·협조 인력. 없으면 이 항목 생략)
8. "주요 일정" — 아래 구조. **재료에 없는 항목은 그 줄을 통째로 생략한다**(빈칸을 날짜로 메우지 마라).
   1. 희망 착수일: (재료에 명시된 날짜가 있을 때만)
   2. 주요 마일스톤: (내용)
   3. 최종 오픈(납품) 희망일: (재료에 명시된 날짜가 있을 때만)
   4. 개발 기간: (재료에 기간이 있으면 그대로. 예: "착수 후 2주")
9. "지원 자격 및 우대 사항" — 아래 구조.
   1. 지원 자격
   - (내용)
   2. 우대 사항
   - (내용)
10. "산출물" — 납품물을 하이픈 리스트로.
11. "계약 관련 특이 사항" — 서술형. 예산, 부품·조립비 별도 협의 등.

- "추천 공고문 제목"·"프로젝트 키워드"는 재료를 바탕으로 **지어도 된다**(공고 등록에 필요한 항목).
  단 재료에 없는 도메인·기술을 끌어오지 마라.

반드시 아래 JSON 형식으로만 답한다(body 안의 줄바꿈은 \\n):
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
      if (c.transcript) parts.push(`[녹취] ${c.transcript}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

/** 의뢰 원문 + 선택 녹취로 공고문 초안을 만든다. */
export async function draftPosting(text: string, calls: DraftCall[]): Promise<DraftResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const material =
    `① 고객 의뢰 원문:\n"""\n${text}\n"""\n\n` +
    (calls.length > 0
      ? `② 검수 통화 녹취 (${calls.length}건, 시간순):\n"""\n${callsBlock(calls)}\n"""`
      : "② 통화 녹취: 없음");

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
