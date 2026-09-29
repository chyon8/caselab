/**
 * 공고 원문을 문맥으로 읽어 마케팅 타깃 축을 추출한다.
 *
 * 사용:
 *   node scripts/analyze-target-demand-llm.mjs prepare
 *   node scripts/analyze-target-demand-llm.mjs classify
 *   node scripts/analyze-target-demand-llm.mjs classify 20
 *
 * 원문·프로젝트 ID·행 단위 LLM 결과는 .private/에만 둔다. 성과/상태/계약금액은 모델에 보내지 않는다.
 */
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { readEnv } from "./env.mjs";

const MODE = process.argv[2] ?? "prepare";
const LIMIT = Number.parseInt(process.argv[3] ?? "0", 10);
const MODEL = "gpt-5.5";
const CONCURRENCY = 48;
const MAX_CHARS = 18_000;
const PRIVATE_DIR = new URL("../.private/target-demand/", import.meta.url);
const SOURCE_PATH = new URL("projects.jsonl", PRIVATE_DIR);
const OUTPUT_PATH = new URL("extractions.jsonl", PRIVATE_DIR);

const sql = neon(readEnv("DATABASE_URL"));

const SYSTEM = `너는 외주 개발 공고를 읽고 마케팅 타깃 분석에 필요한 사실만 추출한다.

질문은 반드시 다음 한 세트다.
  발주사 또는 서비스 대상의 업종 × 구체적인 업무·운영 문제 × 만들려는 시스템·서비스

결과(모집·계약·취소), 고객명, 예산, 지원자 수 같은 성과 정보는 절대 보지 않는다.
원문에 직접 적힌 근거만 사용하며, 업종을 추정하지 않는다.

eligible=true 규칙:
- 업종이 발주사 또는 서비스 대상 중 무엇인지 원문에 명시돼야 한다.
- 업무·운영 문제는 단순히 "개발이 필요"가 아니라, 처리·관리·연동·자동화하려는 구체적 업무여야 한다.
- 시스템·서비스는 만들려는 결과물이어야 한다.
- 세 축을 각각 뒷받침하는 짧은 원문 인용을 evidence에 넣을 수 있어야 한다.

eligible=false 규칙:
- 업종이 없거나 추정이 필요한 경우
- 단순 홈페이지·앱·쇼핑몰 구축처럼 업무 문제가 특정되지 않은 경우
- 세 축 중 하나라도 원문 근거가 없는 경우

industry는 "제조업", "병원·의원", "화물·운송", "학원·교육기관"처럼 짧고 구체적으로 쓴다.
problem은 "생산·품질 데이터를 수기로 관리", "배차·운행 상태를 분산 관리"처럼 업무 문제로 쓴다.
system은 "MES·품질관리 시스템", "운송 배차·관제 시스템"처럼 만들려는 시스템으로 쓴다.
targetPhrase는 "업종 × 문제 × 시스템" 형식으로 쓴다.
industryRole은 발주사면 client, 서비스 대상 업종이면 service_target, 둘 다 아니거나 불명확하면 unknown이다.
eligible=false이면 industry/problem/system/targetPhrase/evidence의 값은 모두 ""로 답하고, exclusionReason에 이유를 쓴다.

evidence의 세 값은 반드시 입력 공고에서 **글자 그대로 복사한 연속 문구**여야 한다. 요약·의역·조사 변경·띄어쓰기 변경을 하지 않는다.

반드시 JSON 스키마에 맞춰 답한다.`;

const SCHEMA = {
  name: "target_demand_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      eligible: { type: "boolean" },
      industry: { type: "string" },
      industryRole: { type: "string", enum: ["client", "service_target", "unknown"] },
      problem: { type: "string" },
      system: { type: "string" },
      targetPhrase: { type: "string" },
      exclusionReason: { type: "string" },
      evidence: {
        type: "object",
        additionalProperties: false,
        properties: {
          industry: { type: "string" },
          problem: { type: "string" },
          system: { type: "string" },
        },
        required: ["industry", "problem", "system"],
      },
    },
    required: ["eligible", "industry", "industryRole", "problem", "system", "targetPhrase", "exclusionReason", "evidence"],
  },
};

function scrub(text) {
  return String(text ?? "")
    .replace(/\u0000/g, "")
    .replace(/\d{6}[-\s]?[1-4]\d{6}\b/g, "[주민번호 제거]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[이메일 제거]")
    .replace(/(?:\+82[-\s.]?0?|0)\d{1,2}[-\s.)]?\d{3,4}[-\s.]?\d{4}\b/g, "[전화번호 제거]")
    .replace(/https?:\/\/\S+/gi, "[URL 제거]")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function readJsonl(path) {
  if (!fs.existsSync(path)) return [];
  return fs.readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function valid(result, text) {
  if (!result || typeof result !== "object" || typeof result.eligible !== "boolean") return false;
  const fields = ["industry", "problem", "system", "targetPhrase", "exclusionReason"];
  if (fields.some((field) => typeof result[field] !== "string")) return false;
  if (!result.evidence || ["industry", "problem", "system"].some((field) => typeof result.evidence[field] !== "string")) return false;
  if (!result.eligible) return result.industry === "" && result.problem === "" && result.system === "" && result.targetPhrase === "";
  if (!result.industry || !result.problem || !result.system || !result.targetPhrase) return false;
  const normalize = (value) => String(value).replace(/\s+/g, " ").trim();
  const source = normalize(text);
  return [result.evidence.industry, result.evidence.problem, result.evidence.system]
    .every((quote) => quote && source.includes(normalize(quote)));
}

async function prepare() {
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  const rows = await sql.query(`
    SELECT id::text AS id, title, category, tech, posting_raw
      FROM projects
     WHERE deleted_at IS NULL AND hidden = false
       AND recruit_started_at IS NOT NULL
     ORDER BY id
  `);
  const lines = rows.map((row) => JSON.stringify({
    id: row.id,
    title: scrub(row.title),
    category: scrub(row.category),
    tech: scrub(row.tech),
    posting: scrub(row.posting_raw),
  }));
  fs.writeFileSync(SOURCE_PATH, `${lines.join("\n")}\n`);
  console.log(`원문 스냅샷 ${rows.length}건 → ${SOURCE_PATH.pathname}`);
}

async function classifyOne(key, record) {
  const text = `제목: ${record.title}\n기존 분야: ${record.category || "-"}\n기술: ${record.tech || "-"}\n\n공고 본문:\n${record.posting.slice(0, MAX_CHARS)}`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      reasoning_effort: "high",
      response_format: { type: "json_schema", json_schema: SCHEMA },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: text }],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = await response.json();
  const raw = body.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("모델 응답 본문 없음");
  const result = JSON.parse(raw);
  if (!valid(result, text)) throw new Error("모델 추출값 또는 근거 인용 불일치");
  return { id: record.id, model: MODEL, result };
}

async function classify() {
  const records = readJsonl(SOURCE_PATH);
  if (!records.length) throw new Error("원문 스냅샷이 없습니다. 먼저 prepare를 실행하세요.");
  const completed = new Map(readJsonl(OUTPUT_PATH).map((row) => [row.id, row]));
  const pending = records.filter((record) => !completed.has(record.id)).slice(0, LIMIT || undefined);
  const key = readEnv("OPENAI_API_KEY");
  console.log(`분류 대상 ${pending.length}건 (기완료 ${completed.size}건)`);
  let cursor = 0;
  let done = 0;
  const failures = [];
  async function worker() {
    while (cursor < pending.length) {
      const record = pending[cursor++];
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const output = await classifyOne(key, record);
          fs.appendFileSync(OUTPUT_PATH, `${JSON.stringify(output)}\n`);
          done++;
          lastError = null;
          if (done % 25 === 0 || done === pending.length) console.log(`  ${done}/${pending.length}`);
          break;
        } catch (error) {
          lastError = error;
          await wait(attempt * 1_000);
        }
      }
      if (lastError) failures.push(`${record.id}: ${lastError.message}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (failures.length) throw new Error(`분류 실패 ${failures.length}건: ${failures.slice(0, 10).join("; ")}`);
  console.log(`분류 완료 ${done}건`);
}

if (MODE === "prepare") await prepare();
else if (MODE === "classify") await classify();
else throw new Error(`명령 오류: ${MODE}`);
