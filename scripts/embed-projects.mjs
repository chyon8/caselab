// L2 유사사례 — 공고문(제목+본문) 임베딩 → projects.embedding (vector(1536))
// 사용: node scripts/embed-projects.mjs [처리할 프로젝트 수, 기본 100]
// text-embedding-3-large를 dimensions:1536으로 축소해 기존 컬럼 차원에 맞춘다.
// 이미 embedding 있는 프로젝트는 건너뛴다. 원본은 건드리지 않는다.
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const DB = env.match(/DATABASE_URL=(.*)/)[1].trim();
const KEY = env.match(/OPENAI_API_KEY=(.*)/)[1].trim();
const LIMIT = parseInt(process.argv[2] ?? "100", 10);
const MODEL = "text-embedding-3-large";
const DIMS = 1536; // projects.embedding 컬럼 차원
const BATCH = 100; // OpenAI 임베딩 1회 요청당 입력 수
const MAX_CHARS = 7000; // 토큰 한도(8191) 안전 여유
const sql = neon(DB);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function embed(inputs, tries = 6) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify({ model: MODEL, dimensions: DIMS, input: inputs }),
    });
    if (res.status === 429 && attempt < tries) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * (attempt + 1);
      await sleep(wait + 500);
      continue;
    }
    const j = await res.json();
    if (!j.data) throw new Error(JSON.stringify(j).slice(0, 300));
    return { vecs: j.data.map((d) => d.embedding), tokens: j.usage.total_tokens };
  }
}

const rows = await sql.query(
  `SELECT id, title, posting_raw
     FROM projects
    WHERE embedding IS NULL AND posting_raw IS NOT NULL
      AND deleted_at IS NULL AND hidden = false
    ORDER BY id
    LIMIT $1`,
  [LIMIT],
);

console.log(`대상 ${rows.length}개 프로젝트 (모델 ${MODEL}, ${DIMS}차원, 배치 ${BATCH})`);
let done = 0,
  totTokens = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const inputs = batch.map((r) => `${r.title}\n\n${r.posting_raw}`.slice(0, MAX_CHARS));
  try {
    const { vecs, tokens } = await embed(inputs);
    totTokens += tokens;
    const ids = batch.map((r) => r.id);
    const embs = vecs.map((v) => `[${v.join(",")}]`);
    await sql.query(
      `UPDATE projects AS p
          SET embedding = v.emb::vector
         FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::text[]) AS emb) v
        WHERE p.id = v.id`,
      [ids, embs],
    );
    done += batch.length;
    console.log(`  진행 ${done}/${rows.length}`);
  } catch (e) {
    console.error(`[배치 ${i}-${i + batch.length}] ${e.message}`);
  }
  await sleep(6000); // TPM(1M/분) 아래로 유지 — 배치당 ~90K 토큰
}
const cost = (totTokens / 1e6) * 0.13;
console.log(`완료: ${done}개 · 토큰 ${totTokens} · 예상비용 ~$${cost.toFixed(3)}`);
