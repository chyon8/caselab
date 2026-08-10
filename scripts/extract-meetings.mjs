// 사전 미팅 녹취 → 검수용 고정 스키마 추출 배치 → meetings.ai_extract
// 사용: node scripts/extract-meetings.mjs [처리할 미팅 수, 기본 20]
// 이미 추출된 미팅은 건너뛴다(멱등). 원본(meetings.transcript)은 건드리지 않는다.
// ⚠️ 프롬프트는 src/lib/meeting-extract.ts와 같아야 한다 — 한쪽만 고치면 결과가 갈라진다.
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const DB = env.match(/DATABASE_URL=(.*)/)[1].trim();
const KEY = env.match(/OPENAI_API_KEY=(.*)/)[1].trim();
const LIMIT = parseInt(process.argv[2] ?? "20", 10);
const MODEL = "gpt-4o-mini";
const CONCURRENCY = 4;
const CHUNK_CHARS = 60_000;
const MIN_TRANSCRIPT_CHARS = 500;
const sql = neon(DB);

const SYSTEM = `너는 위시켓 프로젝트 "검수 매니저"를 돕는 어시스턴트다.
모집 단계에서 진행된 사전 미팅 녹취(3자 대화)를 받아,
검수 매니저가 "무엇이 정해졌고 무엇이 남았나"를 파악하는 데 필요한 것만 남긴다.

참석자 역할 — 누가 무엇을 하기로 했는지 쓸 때 이 정의를 따른다:
· 매니저 = 위시켓 담당자. 양측을 중개하고, 파트너에게 제안서·견적을 요청하고, 계약 절차를 안내한다.
· 클라이언트 = 발주사. 요구사항·자료를 제공한다.
· 파트너 = 개발사. 제안서·견적·개발 방안을 낸다.

반드시 버릴 노이즈: 인사·자기소개·회사 소개·수주 실적 자랑/포트폴리오 홍보/
일정 조율 잡담("그럼 다음 주 화요일에")/녹취 안내·접속 확인 멘트/맞장구·반복 발화.

남길 가치:
(1) 미팅에서 확정된 사항 — 하기로/안 하기로 정한 것, 범위·금액·일정에 대한 합의
(2) 기술적 제약·실현가능성 지적·대안 구현 제안 (근거를 살려서)
(3) 비용·일정·기술·커뮤니케이션 리스크 신호
(4) 아직 안 정해진 쟁점 — 다음에 확인해야 할 것
(5) 후속조치 — 누가 무엇을 하기로 했는지

【자명성 금지】"요구사항을 명확히 해야 한다", "일정 관리가 중요하다"처럼 어느 프로젝트에나
붙는 일반론은 쓰지 않는다. 이 미팅에서 실제로 오간 말에 근거한 것만 남긴다.

【근거를 자르지 말 것】 무슨 얘기를 했다가 아니라 무슨 내용이었는지를 남긴다.
"~에 대해 논의했다", "~ 방식이 논의되었다"처럼 주제만 밝히고 결론·근거가 없는 문장은 쓰지 않는다.
쓸 결론이 없으면 그 항목을 아예 뺀다.
아래는 형식만 보여주는 가상의 예시다 — 다른 프로젝트 얘기이므로 절대 결과에 그대로 쓰지 마라.
❌ 나쁜 예: "결제 연동에 대해 논의함"
✅ 좋은 예: "정기결제는 PG사 심사에 2~3주 걸려 오픈 일정에 영향 — 파트너가 1차엔 단건결제만 붙이자고 제안"

【확정 아닌 것을 확정으로 쓰지 말 것】"~하면 좋겠다", "검토해보겠다", "가능할 것 같다"는
decisions가 아니라 open_issues다. decisions에는 양측이 합의한 것만 넣는다.

【후속조치는 주체를 밝힌다】반드시 "클라이언트: ~", "파트너: ~", "매니저: ~" 셋 중 하나로 시작한다.
사람 이름은 절대 쓰지 않는다(녹취에 이름이 나와도 역할로 바꿔 쓴다).
누가 하기로 했는지 녹취에 없으면 그 항목은 아예 쓰지 않는다.

반드시 아래 JSON 스키마로만 답한다. 한국어로. 해당 내용이 없으면 빈 배열.

스키마:
{
  "decisions": [미팅에서 확정·합의된 사항, 최대 8개],
  "technical_notes": [기술적 제약·실현가능성 지적·대안 제안, 근거 포함 서술형, 최대 8개],
  "risk_signals": [비용·일정·기술·커뮤니케이션 리스크 신호, 최대 6개],
  "open_issues": [아직 안 정해진 쟁점 / 다음에 확인할 것, 최대 6개],
  "follow_ups": ["주체: 할 일" 형식의 후속조치, 최대 6개]
}`;

const MERGE_SYSTEM = `긴 미팅 녹취를 앞에서부터 나눠 추출한 결과 여러 개를 하나로 합친다.
- 같은 내용이 여러 조각에 있으면 더 구체적인(근거가 살아있는) 쪽만 남긴다.
- 없는 내용을 새로 만들지 않는다. 주어진 항목의 표현만 다듬어 합친다.
- 뒤 조각에서 뒤집힌 결정은 뒤 조각을 따른다(미팅이 진행되며 바뀐 것이다).
- 앞 조각에서 open_issues였다가 뒤 조각에서 정해진 것은 decisions로 옮긴다.

입력과 같은 JSON 스키마로만 답한다. 한국어로. 각 배열의 개수 상한도 그대로 지킨다.`;

async function callJson(system, user) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const j = await res.json();
  if (!j.choices) throw new Error(JSON.stringify(j).slice(0, 300));
  return JSON.parse(j.choices[0].message.content);
}

/** 줄 경계로만 자른다 — 발화 한 줄이 두 조각에 걸치면 양쪽 다 문맥을 잃는다 */
function chunkTranscript(t) {
  if (t.length <= CHUNK_CHARS) return [t];
  const chunks = [];
  let cur = "";
  for (const line of t.split("\n")) {
    if (cur.length + line.length + 1 > CHUNK_CHARS && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += line + "\n";
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

// 프롬프트 예시를 그대로 베껴 내는 걸 실측했다(2026-08-10) — 코드가 걷어낸다. lib과 같은 값.
const PROMPT_EXAMPLES = [
  "결제 연동에 대해 논의함",
  "정기결제는 PG사 심사에 2~3주 걸려 오픈 일정에 영향 — 파트너가 1차엔 단건결제만 붙이자고 제안",
];
const ROLES = ["클라이언트", "파트너", "매니저", "고객사", "개발사"];
const norm = (s) => s.replace(/[\s·—–\-,."'()]/g, "");

function dropExampleEchoes(items) {
  const examples = PROMPT_EXAMPLES.map(norm);
  return (items ?? []).filter((it) => {
    const n = norm(it);
    return n.length >= 8 && !examples.some((ex) => n.includes(ex) || ex.includes(n));
  });
}

/** 주체가 역할이 아니면 실명으로 보고 지운다 (녹취 속 이름을 새 필드로 옮기지 않기 위해) */
function scrubFollowUpSubject(s) {
  const m = s.match(/^([^:：]{1,24})[:：]\s*(.+)$/);
  if (!m) return s;
  return ROLES.some((r) => m[1].includes(r)) ? s : `담당자: ${m[2]}`;
}

async function extract(m) {
  const head =
    `프로젝트: ${m.title}\n` +
    `개발사: ${m.partner_slug || "(미상)"}\n` +
    (m.summary ? `미팅 개요: ${m.summary}\n` : "");
  const chunks = chunkTranscript(m.transcript);

  let o;
  if (chunks.length === 1) {
    o = await callJson(SYSTEM, `${head}\n=== 미팅 녹취 ===\n${chunks[0]}`);
  } else {
    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      parts.push(
        await callJson(
          SYSTEM,
          `${head}\n(이 녹취는 긴 미팅을 순서대로 나눈 ${i + 1}/${chunks.length} 조각이다. 이 조각에 실제로 나온 것만 뽑는다.)\n\n=== 미팅 녹취 ===\n${chunks[i]}`,
        ),
      );
    }
    o = await callJson(
      MERGE_SYSTEM,
      `${head}\n=== 조각별 추출 결과 (${parts.length}개, 미팅 진행 순서) ===\n` +
        parts.map((p, i) => `[조각 ${i + 1}]\n${JSON.stringify(p, null, 1)}`).join("\n\n"),
    );
  }

  return {
    decisions: dropExampleEchoes(o.decisions),
    technicalNotes: dropExampleEchoes(o.technical_notes),
    riskSignals: dropExampleEchoes(o.risk_signals),
    openIssues: dropExampleEchoes(o.open_issues),
    followUps: dropExampleEchoes(o.follow_ups).map(scrubFollowUpSubject),
    sourceLen: m.transcript.length,
  };
}

// 대상: 아직 추출 없음 + 녹취가 껍데기가 아님 + 녹취가 갱신돼 길이가 달라진 건(재추출)
const rows = await sql.query(
  `SELECT m.id, m.partner_slug, m.summary, m.transcript, p.title
     FROM meetings m
     JOIN projects p ON p.id = m.project_id
    WHERE m.transcript IS NOT NULL AND length(m.transcript) >= $2
      AND (m.ai_extract IS NULL
           OR (m.ai_extract ? 'sourceLen'
               AND (m.ai_extract->>'sourceLen')::int <> length(m.transcript)))
    ORDER BY m.created_at DESC
    LIMIT $1`,
  [LIMIT, MIN_TRANSCRIPT_CHARS],
);

console.log(`대상 ${rows.length}건 (모델 ${MODEL}, 동시성 ${CONCURRENCY})`);
let done = 0,
  fail = 0,
  cursor = 0;
async function worker() {
  while (cursor < rows.length) {
    const m = rows[cursor++];
    try {
      const x = await extract(m);
      await sql.query(`UPDATE meetings SET ai_extract = $2 WHERE id = $1`, [m.id, JSON.stringify(x)]);
      done++;
    } catch (e) {
      fail++;
      console.error(`[meeting ${m.id}] ${e.message}`);
    }
    if ((done + fail) % 10 === 0) console.log(`  진행 ${done + fail}/${rows.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`완료: 성공 ${done} / 실패 ${fail}`);
