// 제출 전 원문 블라인드 표본 준비 및 AI 분류.
// 프로젝트 ID 매핑만 .private에 두고, 연락처를 제거한 익명 검증 자료는 Git에 저장한다.
// 사용:
//   node scripts/classify-submission-text.mjs prepare
//   node scripts/classify-submission-text.mjs classify calibration
//   node scripts/classify-submission-text.mjs classify validation
//   node scripts/classify-submission-text.mjs classify full  (사람 검증 통과 후에만)
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { readEnv } from "./env.mjs";

const MODE = process.argv[2] ?? "prepare";
const SCOPE = process.argv[3] ?? "calibration";
const MODEL = "gpt-4o-mini";
const CONCURRENCY = 5;
const PRIVATE_DIR = new URL("../.private/submission-conversion/", import.meta.url);
const REVIEW_DIR = new URL("../analysis/submission-conversion/review/", import.meta.url);
const sql = neon(readEnv("DATABASE_URL"));

const SYSTEM = `너는 프로젝트 제출 원문의 정보 표현과 내용을 분류한다.
결과·거절 사유·고객 신원은 보지 않는다. 원문에 직접 적힌 근거만 사용하고 추측하지 않는다.
짧은 글을 나쁘다고 간주하지 말고, 언급이 없으면 none/unknown으로 답한다.

원문에는 플랫폼이 고객에게 보여준 질문·도움말·작성 예시가 섞여 있다. 질문 문장 자체는 고객의 답이
아니므로 어떤 근거로도 쓰지 않는다. "필요합니다"와 "보유하고 있습니다/첨부합니다"도 구분한다.

반드시 JSON 객체 하나로 답한다.
{
  "purpose_context": "none|purpose_only|purpose_and_context",
  "function_specificity": "none|list|behavior",
  "scope_definition": "none|deliverable_or_boundary|both",
  "project_mode": "new_build|enhancement|maintenance|integration_migration|consulting|unknown",
  "existing_system_or_integration": false,
  "preparation_artifacts": ["requirements","screen_design","reference","existing_data","api_spec","other"],
  "evidence": {
    "purpose_context": "원문 근거 또는 빈 문자열",
    "function_specificity": "원문 근거 또는 빈 문자열",
    "scope_definition": "원문 근거 또는 빈 문자열",
    "project_mode": "원문 근거 또는 빈 문자열",
    "existing_system_or_integration": "원문 근거 또는 빈 문자열",
    "preparation_artifacts": "원문 근거 또는 빈 문자열"
  }
}

정의:
- purpose_context: 왜 하는지 목적만 있으면 purpose_only, 실제 사용자·사용 상황까지 있으면 purpose_and_context.
- function_specificity: 기능명 나열은 list, 입력→처리→결과나 조건·예외가 있으면 behavior.
- scope_definition: 고객이 실제 산출물(소스코드·디자인·문서 등) 또는 포함/제외 범위를 명시한 경우만
  deliverable_or_boundary, 둘 다면 both. 기능 목록·외부 연동·화면 이름만으로는 범위가 정의된 것이 아니다.
- project_mode: 가장 직접적인 1개만. 근거가 없으면 unknown.
- existing_system_or_integration: 기존 시스템·외부 API·데이터 이전/연동이 명시된 경우만 true.
- preparation_artifacts: 실제 보유하거나 첨부·제공한다고 적힌 자료만. 요구사항을 본문에 적은 것,
  플랫폼 질문 문구, 앞으로 필요하다는 말은 보유 자료가 아니다. 근거가 없으면 반드시 빈 배열이다.`;

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function shuffle(items, seed) {
  const result = [...items];
  const rand = random(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function oneLine(value) {
  return String(value ?? "")
    .replace(/\d{6}[-\s]?[1-4]\d{6}\b/g, "[주민번호 제거]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[이메일 제거]")
    .replace(/(?:\+82[-\s.]?0?|0)\d{1,2}[-\s.)]?\d{3,4}[-\s.]?\d{4}\b/g, "[전화번호 제거]")
    .replace(/https?:\/\/\S+/gi, "[URL 제거]")
    .replace(/((?:담당자|성명|연락처 이름|연락 담당자)\s*[:：]\s*)[가-힣A-Za-z]{2,20}/gi, "$1[이름 제거]")
    .replace(/<[^>]*>/g, " ")
    .replace(/의뢰 배경,?\s*달성하려는 목적\/?목표를 알려주세요\.?/g, " ")
    .replace(/핵심적인 기능\s*\(혹은 화면 구성\)이나 아이디어에 대해 알려주세요\.?/g, " ")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tsvCell(value) {
  return String(value ?? "").replace(/[\t\r\n]+/g, " ");
}

async function targets() {
  return sql.query(`
    SELECT project_id, initial_description, raw_status, submitted_at, recruited_at
      FROM submission_analysis_projects
     WHERE snapshot_modified_at <= submitted_at
       AND initial_description IS NOT NULL
       AND length(btrim(initial_description)) > 0
     ORDER BY project_id
  `);
}

function writeReview(path, records) {
  const columns = [
    "anon_id", "description", "purpose_context", "function_specificity", "scope_definition",
    "project_mode", "existing_system_or_integration", "preparation_artifacts", "reviewer_note",
  ];
  const lines = [columns.join("\t")];
  for (const record of records) {
    lines.push([record.anon_id, tsvCell(record.description), "", "", "", "", "", "", ""].join("\t"));
  }
  fs.writeFileSync(path, `${lines.join("\n")}\n`);
}

async function prepare() {
  const rows = await targets();
  if (rows.length !== 859) throw new Error(`원문 대상 불일치: ${rows.length} (기대 859)`);
  const ordered = shuffle(rows, 20260922).map((row, index) => ({
    anon_id: `T${String(index + 1).padStart(4, "0")}`,
    project_id: String(row.project_id),
    description: oneLine(row.initial_description),
    submitted_month: new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
    }).format(new Date(row.submitted_at)),
    recruited_within_14d: row.raw_status === "close_recruiting" && !row.recruited_at
      ? null
      : Boolean(
          row.recruited_at
          && new Date(row.recruited_at).getTime() - new Date(row.submitted_at).getTime() <= 14 * 86_400_000
          && new Date(row.recruited_at).getTime() >= new Date(row.submitted_at).getTime(),
        ),
  }));
  const manifest = {
    seed: 20260922,
    calibration: ordered.slice(0, 40).map(({ anon_id, description }) => ({ anon_id, description })),
    validation: ordered.slice(40, 120).map(({ anon_id, description }) => ({ anon_id, description })),
    full: ordered.slice(120).map(({ anon_id, description }) => ({ anon_id, description })),
  };
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  fs.writeFileSync(
    new URL("text-sample-map.json", PRIVATE_DIR),
    `${JSON.stringify(ordered.map(({ anon_id, project_id }) => ({ anon_id, project_id })), null, 2)}\n`,
  );
  fs.writeFileSync(new URL("text-samples.json", REVIEW_DIR), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(
    new URL("analysis-targets.json", REVIEW_DIR),
    `${JSON.stringify(ordered.map(({ anon_id, submitted_month, recruited_within_14d }) => ({
      anon_id,
      submitted_month,
      recruited_within_14d,
    })), null, 2)}\n`,
  );
  for (const scope of ["calibration", "validation"]) {
    for (const reviewer of ["a", "b"]) {
      writeReview(new URL(`${scope}-reviewer-${reviewer}.tsv`, REVIEW_DIR), manifest[scope]);
    }
  }
  console.log(`표본 준비: 교정 40, 검증 80, 나머지 ${manifest.full.length}`);
}

function validOutput(value) {
  const purpose = ["none", "purpose_only", "purpose_and_context"];
  const functions = ["none", "list", "behavior"];
  const scope = ["none", "deliverable_or_boundary", "both"];
  const modes = ["new_build", "enhancement", "maintenance", "integration_migration", "consulting", "unknown"];
  if (!purpose.includes(value.purpose_context)) return false;
  if (!functions.includes(value.function_specificity)) return false;
  if (!scope.includes(value.scope_definition)) return false;
  if (!modes.includes(value.project_mode)) return false;
  if (typeof value.existing_system_or_integration !== "boolean") return false;
  if (!Array.isArray(value.preparation_artifacts)) return false;
  const allowedArtifacts = ["requirements", "screen_design", "reference", "existing_data", "api_spec", "other"];
  if (value.preparation_artifacts.some((item) => !allowedArtifacts.includes(item))) return false;
  const artifactEvidence = String(value.evidence?.preparation_artifacts ?? "").trim().toLowerCase();
  if (!artifactEvidence || artifactEvidence === "none") value.preparation_artifacts = [];
  return true;
}

async function classifyOne(key, record) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: record.description.slice(0, 30_000) },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const body = await response.json();
  const result = JSON.parse(body.choices[0].message.content);
  if (!validOutput(result)) throw new Error("분류 스키마 불일치");
  return { anon_id: record.anon_id, model: MODEL, result };
}

async function classify(scope) {
  if (!["calibration", "validation", "full"].includes(scope)) throw new Error(`범위 오류: ${scope}`);
  const samples = JSON.parse(fs.readFileSync(new URL("text-samples.json", REVIEW_DIR), "utf8"));
  const records = samples[scope];
  const outputPath = new URL(`ai-${scope}.jsonl`, REVIEW_DIR);
  const completed = new Map();
  if (fs.existsSync(outputPath)) {
    for (const line of fs.readFileSync(outputPath, "utf8").split("\n").filter(Boolean)) {
      const parsed = JSON.parse(line);
      completed.set(parsed.anon_id, parsed);
    }
  }
  const pending = records.filter((record) => !completed.has(record.anon_id));
  const key = readEnv("OPENAI_API_KEY");
  let cursor = 0;
  let done = 0;
  const failures = [];
  async function worker() {
    while (cursor < pending.length) {
      const record = pending[cursor++];
      let lastError;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await classifyOne(key, record);
          fs.appendFileSync(outputPath, `${JSON.stringify(result)}\n`);
          done++;
          lastError = null;
          if (done % 10 === 0) console.log(`${done}/${pending.length}`);
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) failures.push(`${record.anon_id}: ${lastError.message}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (failures.length) throw new Error(`AI 분류 실패 ${failures.length}건: ${failures.join("; ")}`);
  console.log(`AI ${scope}: 신규 ${done}, 전체 ${records.length}`);
}

if (MODE === "prepare") await prepare();
else if (MODE === "classify") await classify(SCOPE);
else throw new Error(`명령 오류: ${MODE}`);
