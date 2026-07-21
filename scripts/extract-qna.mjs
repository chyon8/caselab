// 개발사 Q&A 노이즈 제거 + 핵심 요약 배치 추출 → ai_insights.qna_summary
// 사용: node scripts/extract-qna.mjs [처리할 프로젝트 수, 기본 100]
// 이미 요약된 프로젝트는 건너뛴다. 원본(timeline_events)은 건드리지 않는다.
// technical_notes 필드 추가 이전에 만들어진 요약은 그 키가 없으므로 자동으로 다시 집어간다
// (재추출 후엔 빈 배열이라도 키가 생기므로 다시 건너뛴다 — 멱등).
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const DB = env.match(/DATABASE_URL=(.*)/)[1].trim();
const KEY = env.match(/OPENAI_API_KEY=(.*)/)[1].trim();
const LIMIT = parseInt(process.argv[2] ?? "100", 10);
const MODEL = "gpt-4o-mini";
const CONCURRENCY = 6;
const sql = neon(DB);

const SYSTEM = `너는 위시켓 프로젝트 "검수 매니저"를 돕는 어시스턴트다.
프로젝트 공고에 달린 개발사(파트너) 댓글/Q&A 스레드를 받아, 검수 매니저가 이 프로젝트를 검토할 때 알아야 할 것만 남긴다.
반드시 버릴 노이즈: 세일즈/자기소개/지원 인사("지원했습니다")/등급 자랑("상위 0.1% 프라임 파트너")/목업·포트폴리오 링크 홍보/일반적 다짐.
남길 가치: (1) 프로젝트 범위·요구사항을 명확히 하는 질문, (2) 기술적 제약·실현가능성 지적·대안 구현 제안,
(3) 숨은 비용·일정·기술 리스크, (4) 클라이언트가 답변으로 확정한 사항.
중요: 모호하거나 일반적인 질문(예: "요구사항이 무엇인가요?", "레퍼런스가 무엇인가요?", "미팅에서 논의할 내용은?")은 버리고, 구체적이고 이 프로젝트 고유한 질문만 남긴다.

【혼합 텍스트 주의 — 절대 통째로 버리지 말 것】 세일즈 문구·자기소개·지원 인사로 시작하거나 그런 내용이 섞인
긴 댓글이라도, 그 안에 프로젝트 범위를 좁히는 구체적 질문이나 요구사항 갭 지적("~에 대한 처리 방식이 없습니다",
"~기준이 필요합니다" 등)이 있으면 그 부분만 반드시 골라내 남긴다. 댓글 전체가 세일즈처럼 시작한다고
전체를 노이즈로 판단해 버리지 않는다 — 노이즈 판정은 문장 단위이지 댓글 단위가 아니다.

【technical_notes — 특히 신경 쓸 것】
개발사가 근거를 대며 짚은 기술 내용은 검수에서 가장 값지다. 질문으로 바꾸지 말고 근거를 살려 서술형으로 남겨라.
- 기술적 제약/실현 불가능성: "요구한 30~60초 영상은 현존 API로는 고정 아바타 모델 외에 불가, 대부분 10초 내외"
- 대안 구현 방안 제안: "1단계 GPT-4o로 대본 생성 → 2단계 CLOVA/Polly TTS + MoviePy 합성으로 단계적 접근 제안"
- 비용을 좌우하는 기술 선택: "ComfyUI는 이미지 생성이 무료라 API 대비 비용 절감"
❌ 나쁜 예(근거가 잘림): "영상을 이어붙이는 형태인지?"
✅ 좋은 예(근거가 살아있음): "30~60초 영상은 API 직접 생성 불가 — 짧은 클립 이어붙이기가 유일한 방법이나 토큰 소모가 큼"

반드시 아래 JSON 스키마로만 답한다. 한국어로.

스키마:
{
  "key_questions": [검수 시 짚어야 할 구체적 핵심 질문/쟁점, 최대 6개, 없으면 []],
  "decisions": [클라이언트가 답변으로 확정한 사항, 없으면 []],
  "risk_signals": [비용·일정·기술 리스크 신호, 없으면 []],
  "technical_notes": [기술적 제약·실현가능성 지적·대안 구현 제안, 근거 포함 서술형, 최대 6개, 없으면 []],
  "keywords": [핵심 키워드/기술/도메인, 최대 8개],
  "noise_dropped": 버린 노이즈 댓글 수(정수 추정)
}`;

async function extract(title, threads) {
  const body = threads
    .map((t, i) => `[댓글 ${i + 1}${t.by ? ` by ${t.by}` : ""}]\nQ: ${t.title || ""}\nA: ${t.body || "(답변없음)"}`)
    .join("\n\n");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `프로젝트 제목: ${title}\n\n=== 댓글/Q&A 스레드 (${threads.length}개) ===\n${body}` },
      ],
    }),
  });
  const j = await res.json();
  if (!j.choices) throw new Error(JSON.stringify(j).slice(0, 300));
  const o = JSON.parse(j.choices[0].message.content);
  return {
    keyQuestions: o.key_questions ?? [],
    decisions: o.decisions ?? [],
    riskSignals: o.risk_signals ?? [],
    technicalNotes: o.technical_notes ?? [],
    keywords: o.keywords ?? [],
    noiseDropped: o.noise_dropped ?? 0,
    sourceCount: threads.length,
  };
}

async function save(projectId, summary) {
  await sql.query(
    `INSERT INTO ai_insights (project_id, qna_summary, model, generated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (project_id) DO UPDATE
       SET qna_summary = EXCLUDED.qna_summary, model = EXCLUDED.model, generated_at = now()`,
    [projectId, JSON.stringify(summary), MODEL],
  );
}

const rows = await sql.query(
  `SELECT t.project_id, p.title,
          json_agg(json_build_object('title', left(t.title,700), 'body', left(t.body,700), 'by', t.meta->>'by')) AS threads
     FROM timeline_events t
     JOIN projects p ON p.id = t.project_id
     LEFT JOIN ai_insights ai ON ai.project_id = t.project_id
    WHERE t.source = 'qna' AND t.title IS NOT NULL
      AND p.deleted_at IS NULL AND p.hidden = false
      AND (ai.qna_summary IS NULL OR ai.qna_summary->'technicalNotes' IS NULL)
    GROUP BY t.project_id, p.title
    LIMIT $1`,
  [LIMIT],
);

console.log(`대상 ${rows.length}개 프로젝트 (모델 ${MODEL}, 동시성 ${CONCURRENCY})`);
let done = 0,
  fail = 0;
let cursor = 0;
async function worker() {
  while (cursor < rows.length) {
    const r = rows[cursor++];
    try {
      const summary = await extract(r.title, r.threads);
      await save(r.project_id, summary);
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
