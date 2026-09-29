// .private/target-demand/의 원장(v2/ledger.json)과 원문 근거(extractions.jsonl)를 CaseLab Neon의
// target_demand_ledger에 통째로 다시 적재한다. 본진 DB는 건드리지 않는다. 외부 AI API는 호출하지 않는다.
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { readEnv } from "./env.mjs";

const DIR = new URL("../.private/target-demand/", import.meta.url);
const units = JSON.parse(fs.readFileSync(new URL("v2/ledger.json", DIR), "utf8"));
const evidence = new Map();
for (const line of fs.readFileSync(new URL("extractions.jsonl", DIR), "utf8").split("\n").filter(Boolean)) {
  const row = JSON.parse(line);
  if (row.result?.eligible && row.result.evidence) evidence.set(row.id, row.result.evidence);
}

const rows = units.flatMap((unit) => unit.ids.map((id) => ({ id, unit, quote: evidence.get(id) })));
const column = (pick) => rows.map(pick);

const sql = neon(readEnv("DATABASE_URL"));
// 테이블이 없으면 만든다 (멱등). HTTP 드라이버는 한 번에 한 문장만 받는다.
const migration = fs.readFileSync(new URL("../migrations/023_target_demand_ledger.sql", import.meta.url), "utf8")
  .split("\n").filter((line) => !line.startsWith("--")).join("\n");
for (const stmt of migration.split(";").map((s) => s.trim()).filter(Boolean)) await sql.query(stmt);
await sql.transaction([
  sql.query("DELETE FROM target_demand_ledger"),
  sql.query(
    `INSERT INTO target_demand_ledger (project_id, unit_id, status, industry, problem, system, industry_group,
            system_type, group_key, detail_key, reason, evidence_industry, evidence_problem, evidence_system)
     SELECT * FROM unnest($1::bigint[], $2::bigint[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[],
            $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::text[], $14::text[])`,
    [
      column((r) => r.id), column((r) => r.unit.unit), column((r) => r.unit.status),
      column((r) => r.unit.industry ?? null), column((r) => r.unit.problem ?? null), column((r) => r.unit.system ?? null),
      column((r) => r.unit.industryGroup ?? null), column((r) => r.unit.systemType ?? null),
      column((r) => r.unit.key ?? null), column((r) => r.unit.detailKey ?? null), column((r) => r.unit.reason ?? null),
      column((r) => r.quote?.industry ?? null), column((r) => r.quote?.problem ?? null), column((r) => r.quote?.system ?? null),
    ],
  ),
]);
const [{ n, u }] = await sql.query("SELECT count(*)::int AS n, count(DISTINCT unit_id)::int AS u FROM target_demand_ledger");
console.log({ units: units.length, postings: rows.length, loadedPostings: n, loadedUnits: u });
