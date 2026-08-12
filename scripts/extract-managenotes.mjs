// 매니저 내부 노트 묶음 → 프로젝트 단위 추출 → ai_insights.note_extract
// 사용: node scripts/extract-managenotes.mjs [처리할 프로젝트 수, 기본 30]
// 이미 추출된 프로젝트는 건너뛴다. 노트 수가 늘면 다시 집어간다(멱등).
// ⚠️ 프롬프트는 src/lib/managenote-extract.ts와 같아야 한다 — 한쪽만 고치면 결과가 갈라진다.
import { neon } from "@neondatabase/serverless";
import { readEnv } from "./env.mjs";

const DB = readEnv("DATABASE_URL");
const KEY = readEnv("OPENAI_API_KEY");
const LIMIT = parseInt(process.argv[2] ?? "30", 10);
const MODEL = "gpt-4o-mini";
const CONCURRENCY = 5;
const sql = neon(DB);

const SYSTEM = `너는 위시켓 프로젝트 "검수 매니저"를 돕는 어시스턴트다.
한 프로젝트에 매니저들이 시간순으로 남긴 내부 노트를 받아,
핸드오프 이후 **이 프로젝트에 무슨 일이 있었는지** 파악하는 데 필요한 것만 남긴다.

노트는 건당 평균 100~150자짜리 단편이고, 매니저가 자기만 알아보게 축약해 쓴다
("클)" = 클라이언트, "파)" = 파트너, "@클"/"@파" = 발송 대상, 영문 슬러그 = 파트너 계정명).

【반드시 버릴 노이즈 — 전체의 60~70%가 여기 해당한다】
· 미팅 일정 조율·확정·취소 ("11/12(화) 오후 2시 30분 양자 화상 확정", "부재중 1회")
· 고객·파트너에게 보낼 문자/카톡/메일 **원문 그대로** (인사말로 시작하는 안내문)
· 발송·연락 기록만 있는 것 ("문자 재발송", "채널톡 유입문자")
· 매니저 간 인수인계·개인 todo ("@은서 11/21 지원여부 체크")
· 포트폴리오 URL만 나열된 것

【남길 가치】
(1) outcome — 계약·취소·보류로 이어진 **결정과 그 이유**. 결과만 쓰지 말고 왜 그렇게 됐는지까지.
(2) client_requirements — 통화·미팅에서 드러난, **공고에는 없던** 클라이언트 조건·선호
(3) scope_changes — 금액·과업·일정이 **바뀐 것** (전후를 다 쓴다)
(4) partner_feedback — 파트너에 대한 평가·점수·탈락 사유
(5) risk_signals — 비용·일정·신뢰·커뮤니케이션 리스크 신호
(6) other_notes — **위 다섯 어디에도 안 맞지만 검수 매니저가 알면 쓸모 있는 것.**
    단, 1~5 중 하나에 들어갈 수 있으면 **반드시 거기에 넣는다.** other_notes는 마지막 수단이다.

【⚠️ 남의 프로젝트 얘기 주의】 노트에 CS 티켓 로그가 섞여 들어와 **다른 프로젝트 번호**가 박혀
있는 경우가 있다 ("클/kimkoryo/미팅조율/유선/139832/CS"). 지금 보고 있는 프로젝트 얘기만 남긴다.

【자명성 금지】"소통이 중요하다", "일정 관리가 필요하다"처럼 어느 프로젝트에나 붙는 일반론은
쓰지 않는다. 이 노트들에 실제로 적힌 것만 남긴다.

【근거를 자르지 말 것】 무슨 일이 있었다가 아니라 무슨 내용이었는지를 남긴다.
아래는 형식만 보여주는 가상의 예시다 — 다른 프로젝트 얘기이므로 절대 결과에 그대로 쓰지 마라.
❌ 나쁜 예: "파트너 관련 이슈로 계약 무산"
✅ 좋은 예: "다른 업체와 계약 — 매출을 공개하지 않아 신뢰도가 낮았고 견적이 한 번 지연됐으며 전화 연결이 잘 안 됨"

【개인 실명】클라이언트 개인의 실명은 쓰지 않는다(직함·역할로 바꾼다).
매니저명과 파트너 계정 슬러그는 그대로 써도 된다.

반드시 아래 JSON 스키마로만 답한다. 한국어로. 해당 내용이 없으면 빈 배열.

스키마:
{
  "outcome": [계약·취소·보류 결정과 그 이유, 최대 5개],
  "client_requirements": [공고에 없던 클라이언트 조건·선호, 최대 6개],
  "scope_changes": [금액·과업·일정 변경, 전후 포함, 최대 5개],
  "partner_feedback": [파트너 평가·점수·탈락 사유, 최대 6개],
  "risk_signals": [리스크 신호, 최대 5개],
  "other_notes": [위 어디에도 안 맞지만 알아둘 것, 최대 4개],
  "noise_dropped": 버린 노이즈 노트 수(정수 추정)
}`;

const PROMPT_EXAMPLES = [
  "파트너 관련 이슈로 계약 무산",
  "다른 업체와 계약 — 매출을 공개하지 않아 신뢰도가 낮았고 견적이 한 번 지연됐으며 전화 연결이 잘 안 됨",
];
const norm = (s) => s.replace(/[\s·—–\-,."'()]/g, "");
function dropExampleEchoes(items) {
  const examples = PROMPT_EXAMPLES.map(norm);
  return (items ?? []).filter((it) => {
    const n = norm(it);
    return n.length >= 8 && !examples.some((ex) => n.includes(ex) || ex.includes(n));
  });
}

async function extract(title, notes) {
  const body = notes.map((n) => `[${n.at}|${n.kind || "일반"}|${n.by || "?"}] ${n.body}`).join("\n\n");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `프로젝트 제목: ${title}\n\n=== 매니저 노트 (시간순, ${notes.length}건) ===\n${body}` },
      ],
    }),
  });
  const j = await res.json();
  if (!j.choices) throw new Error(JSON.stringify(j).slice(0, 300));
  const o = JSON.parse(j.choices[0].message.content);
  return {
    outcome: dropExampleEchoes(o.outcome),
    clientRequirements: dropExampleEchoes(o.client_requirements),
    scopeChanges: dropExampleEchoes(o.scope_changes),
    partnerFeedback: dropExampleEchoes(o.partner_feedback),
    riskSignals: dropExampleEchoes(o.risk_signals),
    otherNotes: dropExampleEchoes(o.other_notes),
    noiseDropped: o.noise_dropped ?? 0,
    sourceCount: notes.length,
  };
}

// 대상: 노트가 있는데 추출이 없거나, 추출 후 노트 수가 달라진 프로젝트
const rows = await sql.query(
  `SELECT g.project_id, g.title, g.notes, g.cnt
     FROM (
       SELECT t.project_id, p.title, count(*)::int AS cnt,
              json_agg(json_build_object(
                'at',   to_char(t.event_at, 'MM-DD'),
                'kind', t.title,
                'by',   t.meta->>'by',
                'body', t.body
              ) ORDER BY t.event_at) AS notes
         FROM timeline_events t
         JOIN projects p ON p.id = t.project_id
        WHERE t.source = 'managenote' AND t.body IS NOT NULL AND length(t.body) > 0
          AND p.deleted_at IS NULL AND p.hidden = false
        GROUP BY t.project_id, p.title
     ) g
     LEFT JOIN ai_insights ai ON ai.project_id = g.project_id
    WHERE ai.note_extract IS NULL
       OR (ai.note_extract->>'sourceCount')::int <> g.cnt
    ORDER BY g.cnt DESC
    LIMIT $1`,
  [LIMIT],
);

console.log(`대상 ${rows.length}개 프로젝트 (모델 ${MODEL}, 동시성 ${CONCURRENCY})`);
let done = 0,
  fail = 0,
  cursor = 0;
async function worker() {
  while (cursor < rows.length) {
    const r = rows[cursor++];
    try {
      const x = await extract(r.title, r.notes);
      await sql.query(
        `INSERT INTO ai_insights (project_id, note_extract, model, generated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (project_id) DO UPDATE
           SET note_extract = EXCLUDED.note_extract, model = EXCLUDED.model, generated_at = now()`,
        [r.project_id, JSON.stringify(x), MODEL],
      );
      done++;
    } catch (e) {
      fail++;
      console.error(`[pid ${r.project_id}] ${e.message}`);
    }
    if ((done + fail) % 20 === 0) console.log(`  진행 ${done + fail}/${rows.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`완료: 성공 ${done} / 실패 ${fail}`);
