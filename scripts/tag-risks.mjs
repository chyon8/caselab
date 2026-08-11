// qna_summary.riskSignals(자유 문장) → 고정 택소노미 태그 백필 → ai_insights.risk_tags
// 사용: node scripts/tag-risks.mjs [처리할 프로젝트 수, 기본 100]
// 이미 태깅된 프로젝트는 건너뛴다. qna_summary 원본은 건드리지 않는다.
// ⚠️ src/lib/risk-tags.ts의 사본이다 — 택소노미/프롬프트를 고치면 양쪽을 맞춰야 한다.
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const DB = env.match(/DATABASE_URL=(.*)/)[1].trim();
const KEY = env.match(/OPENAI_API_KEY=(.*)/)[1].trim();
const LIMIT = parseInt(process.argv[2] ?? "100", 10);
const MODEL = "gpt-4o-mini";
const CONCURRENCY = 6;
const sql = neon(DB);

const RISK_TAGS = [
  "외부 연동",
  "결제·정산",
  "데이터 정합성",
  "요구사항 불명확",
  "일정 압박",
  "비용 초과",
  "기술 실현 불확실",
  "성능·트래픽",
  "보안·개인정보",
  "규제·심사",
  "레거시·이관",
  "AI 정확도",
  "하드웨어·기기",
  "자료 미비",
  "운영·의사결정",
];

const SYSTEM = `너는 위시켓 프로젝트 "검수 매니저"를 돕는 분류기다.
개발사(파트너)가 공고 Q&A에서 지적한 **리스크 문장들**을 받아, 아래 고정 태그로만 분류한다.

태그 정의:
- 외부 연동: 서드파티 API·SDK·외부 시스템 연동의 가능 여부, 스펙 불확실, 권한 발급
- 결제·정산: 결제·환불·정산·수수료 흐름과 그 경계 케이스, 금전 분쟁
- 데이터 정합성: 동기화 누락·지연, 중복·이중 집계, 값 불일치, 데이터 유실
- 요구사항 불명확: 범위·기준·산출물이 정해지지 않아 판단이 미뤄진 상태
- 일정 압박: 요구 기간이 촉박하거나 일정 산정 근거가 없음
- 비용 초과: API 사용료·인프라·데이터 구축 등 견적 밖 비용이 발생할 위험
- 기술 실현 불확실: 요구 기능이 기술적으로 되는지 자체가 검증되지 않음
- 성능·트래픽: 처리량·응답속도·동시접속·부하
- 보안·개인정보: 권한 분리, 민감정보 노출·유출
- 규제·심사: 스토어 심사, 법·규제, 저작권·라이선스, 인증 획득
- 레거시·이관: 기존 시스템·데이터 이관, 소스 미제공, 리뉴얼 시 기존 구조 영향
- AI 정확도: 모델·인식 정확도가 보장되지 않음
- 하드웨어·기기: 디바이스·센서·네트워크 등 물리 환경 의존
- 자료 미비: 클라이언트가 줘야 할 자료·콘텐츠·기획 산출물이 없음
- 운영·의사결정: 담당자 부재·협의 지연, 출시 후 운영·유지보수 주체 미정

【가장 중요】 **결과가 아니라 원인**에 태그를 단다. 결과절("~해서 일정이 늘 수 있음",
"~때문에 비용이 커질 수 있음")에는 태그를 달지 않는다. 원인 쪽 태그 하나로 끝낸다.
- "샘플 데이터 형태에 따라 아키텍처가 달라져 일정 수립에 영향을 줄 수 있음"
  → {"tags": ["요구사항 불명확"]}  ("일정 압박"을 같이 달면 틀린 것이다 — 일정은 결과다)
- "이미지 5만 장 처리 비용이 몇백만원에 이를 수 있음" → {"tags": ["비용 초과"]}
"일정 압박"은 요구 기간 자체가 촉박하다고 말할 때만, "비용 초과"는 실제로 돈이 더 드는
항목을 짚을 때만 단다.

문장 하나에 태그가 여러 개일 수 있고, 태그 하나에 문장이 여럿일 수도 있다.
목록 전체에서 **실제로 지적된 것만** 고른다 — 억지로 채우지 않는다. 해당 없으면 빈 배열.

반드시 아래 JSON으로만 답한다.
{"tags": ["태그명", ...]}`;

async function tag(title, signals) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      store: true,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `프로젝트 제목: ${title}\n\n=== 리스크 문장 (${signals.length}개) ===\n${signals
            .map((s, i) => `${i + 1}. ${s}`)
            .join("\n")}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`태깅 실패: ${res.status}`);
  const j = await res.json();
  const o = JSON.parse(j.choices[0].message.content);
  const raw = Array.isArray(o.tags) ? o.tags : [];
  return [...new Set(raw.filter((t) => RISK_TAGS.includes(t)))];
}

const targets = await sql.query(
  `SELECT ai.project_id, p.title,
          ARRAY(SELECT jsonb_array_elements_text(ai.qna_summary->'riskSignals')) AS signals
     FROM ai_insights ai
     JOIN projects p ON p.id = ai.project_id
    WHERE ai.risk_tags IS NULL
      AND ai.qna_summary IS NOT NULL
      AND jsonb_array_length(ai.qna_summary->'riskSignals') > 0
      AND p.deleted_at IS NULL AND p.hidden = false
    LIMIT $1`,
  [LIMIT],
);

console.log(`대상 ${targets.length}건`);
let done = 0;
let fail = 0;
let next = 0;

async function worker() {
  while (next < targets.length) {
    const r = targets[next++];
    try {
      const tags = await tag(r.title, r.signals);
      await sql.query(`UPDATE ai_insights SET risk_tags = $2 WHERE project_id = $1`, [
        r.project_id,
        tags,
      ]);
      done++;
      if (done % 25 === 0) console.log(`  ${done}/${targets.length}`);
    } catch (e) {
      fail++;
      console.error(`  실패 ${r.project_id}: ${e.message}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`완료 ${done}건 / 실패 ${fail}건`);
