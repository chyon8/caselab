// eligible 2,902건의 성과·임베딩을 CaseLab Neon에서 읽어 .private/target-demand/v2/에 저장한다.
// SELECT만 실행한다. 외부 AI API는 호출하지 않는다.
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { readEnv } from "./env.mjs";

const DIR = new URL("../.private/target-demand/", import.meta.url);
const OUT = new URL("v2/", DIR);
fs.mkdirSync(OUT, { recursive: true });

const ids = fs.readFileSync(new URL("extractions.jsonl", DIR), "utf8")
  .split("\n").filter(Boolean).map((line) => JSON.parse(line))
  .filter((row) => row.result?.eligible === true).map((row) => row.id);

const sql = neon(readEnv("DATABASE_URL"));
const rows = await sql.query(
  `SELECT id::text AS id, title, client_name, status, stage, recruit_started_at, contract_amount,
          dev_scope, content_hash, embedding::text AS embedding
     FROM projects WHERE id::text = ANY($1::text[])`,
  [ids],
);

const outcomes = rows.map(({ embedding, ...rest }) => rest);
fs.writeFileSync(new URL("outcomes.json", OUT), JSON.stringify(outcomes));
fs.writeFileSync(new URL("embeddings.jsonl", OUT),
  rows.map((row) => JSON.stringify({ id: row.id, v: JSON.parse(row.embedding) })).join("\n") + "\n");
console.log({ eligible: ids.length, fetched: rows.length, missing: ids.filter((id) => !rows.some((row) => row.id === id)).length });
