// 공고 내용 → 공급난이도 트레이트 백필 → ai_insights.supply_tags
// 사용: node scripts/tag-supply.mjs [처리할 프로젝트 수, 기본 200]
// 결판난(계약 도달 or 취소) 프로젝트만. 이미 태깅된 건 건너뛴다.
// ⚠️ src/lib/supply-tags.ts의 사본이다 — 택소노미/프롬프트를 고치면 양쪽을 맞춰야 한다.
import { neon } from "@neondatabase/serverless";
import { readEnv } from "./env.mjs";

const sql = neon(readEnv("DATABASE_URL"));
const KEY = readEnv("OPENAI_API_KEY");
const LIMIT = parseInt(process.argv[2] ?? "200", 10);
const MODEL = "gpt-5.5"; // mini는 "해당 없으면 빈 배열" 제약을 못 지킨다 (실측)
const CONCURRENCY = 8;
const POSTING_CHARS = 700;

const SUPPLY_TAGS = ["회로·펌웨어·임베디드","기구설계·제조도면","산업제어(PLC/SCADA/HMI)","레거시·폐쇄형 스택","특정 SaaS·솔루션 종속","상주·출장·지역 제한","규제·인증 대응","연구성 PoC·자문","게임엔진·3D·VR","인프라 이전·장애 대응","디자인 단건·에셋","기존 코드 인수인계","다국어·해외 타깃"];

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

async function tag(p) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL, store: true,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `제목: ${p.title}\n분야: ${p.category ?? "-"}\n기술: ${p.tech ?? "-"}\n\n공고 본문:\n${(p.posting_raw ?? "").slice(0, POSTING_CHARS)}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`태깅 실패: ${res.status}`);
  const j = await res.json();
  const raw = JSON.parse(j.choices[0].message.content).tags;
  return [...new Set((Array.isArray(raw) ? raw : []).filter((t) => SUPPLY_TAGS.includes(t)))];
}

const targets = await sql.query(
  `SELECT p.id, p.title, p.tech, p.category, p.posting_raw
     FROM projects p
     LEFT JOIN ai_insights ai ON ai.project_id = p.id
    WHERE ai.supply_tags IS NULL
      AND p.deleted_at IS NULL AND p.hidden = false
      AND ((p.stage >= 3 AND p.status <> '완료(취소)') OR p.status = '완료(취소)')
    ORDER BY p.recruit_started_at DESC NULLS LAST
    LIMIT $1`,
  [LIMIT],
);

console.log(`대상 ${targets.length}건`);
let done = 0, fail = 0, next = 0;
async function worker() {
  while (next < targets.length) {
    const r = targets[next++];
    try {
      const tags = await tag(r);
      await sql.query(
        `INSERT INTO ai_insights (project_id, supply_tags) VALUES ($1, $2)
         ON CONFLICT (project_id) DO UPDATE SET supply_tags = EXCLUDED.supply_tags`,
        [r.id, tags],
      );
      done++;
      if (done % 100 === 0) console.log(`  ${done}/${targets.length}`);
    } catch (e) { fail++; console.error(`  실패 ${r.id}: ${e.message}`); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`완료 ${done}건 / 실패 ${fail}건`);
