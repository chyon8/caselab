// 매니저 노트 outcome → 취소 사유 태그 백필 → ai_insights.cancel_tags
// 사용: node scripts/tag-cancels.mjs [처리할 프로젝트 수, 기본 100]
// 취소로 끝났고 노트 추출이 있는 프로젝트만. 이미 태깅된 건 건너뛴다.
// ⚠️ src/lib/cancel-tags.ts의 사본이다 — 택소노미/프롬프트를 고치면 양쪽을 맞춰야 한다.
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const sql = neon(env.match(/DATABASE_URL=(.*)/)[1].trim());
const KEY = env.match(/OPENAI_API_KEY=(.*)/)[1].trim();
const LIMIT = parseInt(process.argv[2] ?? "100", 10);
const MODEL = "gpt-4o-mini";
const CONCURRENCY = 6;

const CANCEL_TAGS = ["클라이언트 연락두절","요구사항·범위 변경","타 업체 선정","클라이언트 내부 사정","사업 방향 불확실","파트너 부적합","예산·자금 부족","일정 지연·보류","자체 개발 전환","법률·정책 제약","플랫폼 조건 불일치"];

const SYSTEM = `너는 위시켓 검수 매니저의 내부 노트에서 **프로젝트가 왜 깨졌는지**를 분류하는 분류기다.
매니저가 남긴 "결과와 그 이유" 문장을 받아, 아래 고정 태그로만 분류한다.

태그 정의:
- 클라이언트 연락두절: 연락·회신·미팅 신청이 없어 그대로 종료
- 요구사항·범위 변경: 과업 범위나 기획이 바뀌어 이 공고로는 진행 불가 (재등록 포함)
- 타 업체 선정: 위시켓 밖 업체, 기존 거래처, 지인 소개 등 다른 곳과 계약
- 클라이언트 내부 사정: 조직 사정·우선순위 변경·담당자 교체로 보류·중단
- 사업 방향 불확실: 아이템·사업 방향이 안 잡혀 진행 판단을 못 내림
- 파트너 부적합: 지원한 개발사의 역량·조건·신뢰가 기대에 못 미침
- 예산·자금 부족: 예산 확보 실패, 지원사업 탈락, 견적이 예산을 넘음
- 일정 지연·보류: 시기가 안 맞아 뒤로 미룸 ("내년에 다시")
- 자체 개발 전환: 내부 인력으로 직접 개발하기로 결정
- 법률·정책 제약: 불법 소지, 규제, 외부 이해관계자 반대
- 플랫폼 조건 불일치: 위시켓 계약 구조·수수료·정책과 안 맞음

【중요】
- **결과가 아니라 이유**를 잡는다. "프로젝트 취소"는 결과다 — 그 뒤에 붙은 까닭이 태그다.
- 이유가 안 적혀 있으면 억지로 고르지 말고 **빈 배열**로 답한다. 추측 금지.
- 이유가 둘이면 둘 다 단다.

【빈 배열로 답해야 하는 경우 — 여기서 실수가 가장 많다】
문장이 "이 프로젝트가 깨진 까닭"을 말하고 있지 않으면 무조건 빈 배열이다. 예:
- 미팅 일정 조율·변경 ("11/15 오후 5시로 미팅 변경 — 클라이언트 일정 혼선")
  → ❌ 일정 지연·보류 아니다. 진행 중 사건일 뿐이다. **빈 배열**
- 자금 조달 방식 변경 ("지원사업 대신 내부 자금으로 진행하기로 함")
  → ❌ 자체 개발 전환도 예산 부족도 아니다. 오히려 진행하겠다는 말이다. **빈 배열**
- 계약·진행이 잘 되고 있다는 경과 보고 → **빈 배열**
"일정 지연·보류"는 프로젝트 자체를 뒤로 미뤄 끝냈을 때만 단다(미팅 일정 조율이 아니다).
"예산·자금 부족"은 돈이 없어 못 하게 됐을 때만 단다(자금 출처가 바뀐 것이 아니다).

반드시 아래 JSON으로만 답한다.
{"tags": ["태그명", ...]}`;

async function tag(title, outcomes) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL, store: true, temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `프로젝트 제목: ${title}\n\n=== 매니저 노트: 결과와 그 이유 (${outcomes.length}개) ===\n${outcomes.map((s,i)=>`${i+1}. ${s}`).join("\n")}` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`태깅 실패: ${res.status}`);
  const j = await res.json();
  const raw = JSON.parse(j.choices[0].message.content).tags;
  return [...new Set((Array.isArray(raw) ? raw : []).filter((t) => CANCEL_TAGS.includes(t)))];
}

const targets = await sql.query(
  `SELECT ai.project_id, p.title,
          ARRAY(SELECT jsonb_array_elements_text(ai.note_extract->'outcome')) AS outcomes
     FROM ai_insights ai
     JOIN projects p ON p.id = ai.project_id
    WHERE ai.cancel_tags IS NULL
      AND ai.note_extract IS NOT NULL
      AND jsonb_array_length(ai.note_extract->'outcome') > 0
      AND p.status = '완료(취소)'
      AND p.deleted_at IS NULL AND p.hidden = false
    LIMIT $1`,
  [LIMIT],
);

console.log(`대상 ${targets.length}건`);
let done = 0, fail = 0, next = 0;
async function worker() {
  while (next < targets.length) {
    const r = targets[next++];
    try {
      const tags = await tag(r.title, r.outcomes);
      await sql.query(`UPDATE ai_insights SET cancel_tags = $2 WHERE project_id = $1`, [r.project_id, tags]);
      done++;
      if (done % 25 === 0) console.log(`  ${done}/${targets.length}`);
    } catch (e) { fail++; console.error(`  실패 ${r.project_id}: ${e.message}`); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`완료 ${done}건 / 실패 ${fail}건`);
