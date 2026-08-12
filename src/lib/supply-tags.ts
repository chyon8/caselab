// 공고 내용 → 공급난이도 트레이트 → ai_insights.supply_tags
// ⚠️ scripts/tag-supply.mjs에 백필용 사본이 있다 — 택소노미/프롬프트를 고치면 양쪽을 맞춰야 한다.
//
// 묻는 것은 "무슨 프로젝트인가"(그건 category·클러스터가 이미 하고 틀렸다)가 아니라
// **"붙을 수 있는 개발사가 몇이나 되나"**다. 난이도가 아니라 공급 풀의 폭이다.
// 그래서 "쇼핑몰 구축" 같은 대분류가 아니라 상주 조건·레거시 스택·회로 설계처럼
// 지원자 수를 실제로 가르는 성질만 태그로 둔다.

/**
 * 다른 추출과 달리 mini가 아니다. 실측: gpt-4o-mini는 "해당 없으면 빈 배열" 제약을 못 지켜
 * 40건 중 32건에 태그를 달았고(지원 99건짜리 홈페이지에도), 프롬프트에 반례로 박아둔 케이스조차
 * 그대로 틀렸다. gpt-5.5로 바꾸니 같은 표본에서 반례가 전부 «없음»으로 정리됐다.
 */
export const SUPPLY_MODEL = "gpt-5.5";

/**
 * 고정 14종. 저지원(지원 1~5건) 프로젝트 160건을 훑어 실제로 반복되는 축만 남겼다.
 * ⚠️ 여기에 "쇼핑몰", "앱 개발" 같은 분야 대분류를 추가하지 말 것 — 그 순간 이 지표는 죽는다.
 * 대부분의 평범한 공고는 **아무 태그도 안 붙는 게 정상**이다(그게 기준선이 된다).
 */
export const SUPPLY_TAGS = [
  "회로·펌웨어·임베디드",
  "기구설계·제조도면",
  "산업제어(PLC/SCADA/HMI)",
  "레거시·폐쇄형 스택",
  "특정 SaaS·솔루션 종속",
  "상주·출장·지역 제한",
  "규제·인증 대응",
  "연구성 PoC·자문",
  "게임엔진·3D·VR",
  "인프라 이전·장애 대응",
  "디자인 단건·에셋",
  "기존 코드 인수인계",
  "다국어·해외 타깃",
] as const;

const SYSTEM = `너는 외주 개발 플랫폼의 공고를 읽고, **이 공고에 지원할 수 있는 개발사가 좁아지는 이유**만 골라내는 분류기다.
"무슨 분야인가"를 묻는 게 아니다. "왜 붙을 회사가 적은가"를 묻는다.

태그 정의:
- 회로·펌웨어·임베디드: PCB/RF 설계, 보드 제작, 펌웨어, 센서 검증 — 순수 SW 외주사가 대응 못 함
- 기구설계·제조도면: CAD 기구설계, 역설계, 공차, CNC/양산 도면, 3D 프린팅 — SW가 아니라 제조 외주
- 산업제어(PLC/SCADA/HMI): 장비 프로토콜, 전장 배선, PLC/SCADA, 작화툴
- 레거시·폐쇄형 스택: .NET/ASP/JSP/델파이/Nexacro/WebSquare/Oracle 등 인력 시장이 얇은 스택
- 특정 SaaS·솔루션 종속: 사방넷·이카운트·더존·카페24·Shopify·워드프레스 등 특정 플랫폼 세팅·연동 의존
- 상주·출장·지역 제한: 상주 필수, 현장 출장, 특정 지역 조건 — 난이도와 무관하게 원격 풀이 사라짐
- 규제·인증 대응: GS인증·의료기기·금융심사 등 인증/심사 통과가 산출물에 포함
- 연구성 PoC·자문: 결과 보장이 어려운 실험·알고리즘 고도화·전문가 자문
- 게임엔진·3D·VR: Unity/Unreal, 3D 모델링·모션, VR 콘텐츠 — 공급자 자체가 다름
- 인프라 이전·장애 대응: DB 마이그레이션, 클라우드 이전, 장애 원인 분석
- 디자인 단건·에셋: 아이콘·템플릿·카탈로그·제안서 등 개발이 아닌 디자인 단건
- 기존 코드 인수인계: 남이 짠 운영 중 코드를 넘겨받아 부분 수정·유지보수
- 다국어·해외 타깃: 국가별 결제·배송·CS·SEO까지 얽힘 (단순 번역·다국어 표시는 제외)

【가장 중요 — 기본값은 빈 배열이다】
이 태그들은 **평범한 공고의 90%에는 하나도 안 붙는다.** 웹사이트·앱·쇼핑몰·업무 시스템을
새로 만드는 보통 공고는 붙을 개발사가 수십 곳이므로 빈 배열이 정답이다.
태그는 **최대 2개**. 확신이 없으면 달지 않는다.

【실제로 틀렸던 예 — 같은 실수를 하지 마라】
- "페인트 브랜드 기업 소개 홈페이지 구축" (워드프레스 언급)
  → ❌ 특정 SaaS·솔루션 종속. 워드프레스로 홈페이지를 만드는 건 공급 풀이 오히려 **넓다**.
  ✅ 빈 배열. 이 태그는 사방넷·이카운트·더존처럼 **그 솔루션을 다뤄본 회사만 지원 가능할 때**만 단다.
- "부동산 컨설팅 업무 자동화 시스템", "출고량 기반 대리점 수당 정산 웹"
  → ❌ 아무 태그도 아니다. 업종이 있다고 전문성이 필요한 게 아니다. ✅ 빈 배열.
- "전자기기 연계 웹페이지 UI 디자인"
  → ❌ 기구설계·제조도면 아니다. 만드는 건 웹페이지다. 제목에 스친 명사에 끌려가지 마라.

판단 기준은 하나다: **"이 조건 때문에 지원 못 하는 개발사가 실제로 많은가?"**
아니면 달지 않는다. 근거가 공고에 문자로 있어야 하고, "아마 어려울 것 같다"는 근거가 아니다.

반드시 아래 JSON으로만 답한다.
{"tags": ["태그명", ...]}`;

export interface SupplyInput {
  title: string;
  tech: string | null;
  category: string | null;
  /** 공고 본문 앞부분. 전문을 넣지 않는다 — 판단에 필요한 신호는 대부분 앞에 있다 */
  posting: string | null;
}

interface RawTags {
  tags?: unknown;
}

/** 공고 앞부분에서 판단에 쓸 만큼만 — 6천 건을 도는 배치라 입력 길이가 비용을 지배한다 */
export const SUPPLY_POSTING_CHARS = 700;

export async function tagSupplyTraits(p: SupplyInput): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: SUPPLY_MODEL,
      store: true,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content:
            `제목: ${p.title}\n` +
            `분야: ${p.category ?? "-"}\n` +
            `기술: ${p.tech ?? "-"}\n\n` +
            `공고 본문:\n${(p.posting ?? "").slice(0, SUPPLY_POSTING_CHARS)}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`공급난이도 태깅 요청 실패: ${res.status}`);

  const j = (await res.json()) as { choices?: { message: { content: string } }[] };
  if (!j.choices?.[0]) throw new Error(JSON.stringify(j).slice(0, 300));
  const o = JSON.parse(j.choices[0].message.content) as RawTags;
  const raw = Array.isArray(o.tags) ? o.tags : [];

  const allowed = new Set<string>(SUPPLY_TAGS);
  return [...new Set(raw.filter((t): t is string => typeof t === "string" && allowed.has(t)))];
}
