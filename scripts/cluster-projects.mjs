// 공고문 임베딩 k-means 클러스터링 → clusters(중심·라벨) + projects.cluster_id
// 사용: node scripts/cluster-projects.mjs [k, 기본 16]
// 선행: migrations/018_clusters.sql 적용, projects.embedding 채워져 있을 것.
//
// ⚠️ 이 스크립트는 **다시 돌리면 유형 경계와 이름이 바뀐다.** 기존 배정을 통째로 덮어쓰므로
//    기간별 비교를 하던 중이라면 함부로 재실행하지 않는다. 신규 프로젝트는 재실행 없이
//    refresh.ts 6단계가 최근접 중심에 붙인다.
//
// 벡터는 text-embedding-3-large(dimensions:1536) 출력이라 이미 L2 정규화돼 있다.
// 그래서 코사인 = 내적이고, 중심도 매 반복 정규화해 같은 구면 위에 둔다(spherical k-means).
import { neon } from "@neondatabase/serverless";
import fs from "fs";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const DB = env.match(/DATABASE_URL=(.*)/)[1].trim();
const KEY = env.match(/OPENAI_API_KEY=(.*)/)[1].trim();
const K = parseInt(process.argv[2] ?? "16", 10);
const DIMS = 1536;
const ITERS = 40;
const PAGE = 400; // 한 요청에 6,000×1536을 다 받으면 응답이 100MB를 넘는다
const LABEL_SAMPLES = 14; // 라벨 지을 때 LLM에 보여줄 중심 최근접 공고 수
const MODEL = "gpt-4o-mini";
const sql = neon(DB);

/** 재실행 시 같은 초기값에서 출발하도록 고정 시드 LCG를 쓴다 (Math.random 금지) */
let seed = 20260811;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

// ── 1) 임베딩 적재 ────────────────────────────────────────────────────────────
console.log("임베딩 적재 중…");
const ids = [];
const titles = [];
const vecs = [];
for (let offset = 0; ; offset += PAGE) {
  const rows = await sql.query(
    `SELECT id, title, embedding::text AS emb
       FROM projects
      WHERE embedding IS NOT NULL AND deleted_at IS NULL AND hidden = false
      ORDER BY id LIMIT $1 OFFSET $2`,
    [PAGE, offset],
  );
  if (rows.length === 0) break;
  for (const r of rows) {
    ids.push(r.id);
    titles.push(r.title);
    vecs.push(Float64Array.from(JSON.parse(r.emb)));
  }
  process.stdout.write(`\r  ${ids.length}건`);
}
console.log(`\n총 ${ids.length}건 · k=${K}`);
if (ids.length < K * 10) throw new Error(`표본이 너무 적다 (${ids.length}건)`);

// ── 2) k-means++ 초기 중심 ────────────────────────────────────────────────────
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < DIMS; i++) s += a[i] * b[i];
  return s;
}

const centers = [Float64Array.from(vecs[Math.floor(rand() * vecs.length)])];
// 가까운 중심과의 코사인이 낮을수록(=멀수록) 뽑힐 확률이 높게 — 거리² 대신 (1-cos)를 쓴다
const nearest = new Float64Array(vecs.length).fill(Infinity);
while (centers.length < K) {
  let sum = 0;
  for (let i = 0; i < vecs.length; i++) {
    const d = 1 - dot(vecs[i], centers[centers.length - 1]);
    if (d < nearest[i]) nearest[i] = d;
    sum += nearest[i] * nearest[i];
  }
  let pick = rand() * sum;
  let idx = vecs.length - 1;
  for (let i = 0; i < vecs.length; i++) {
    pick -= nearest[i] * nearest[i];
    if (pick <= 0) {
      idx = i;
      break;
    }
  }
  centers.push(Float64Array.from(vecs[idx]));
}

// ── 3) 반복 ──────────────────────────────────────────────────────────────────
const assign = new Int32Array(vecs.length).fill(-1);
for (let iter = 0; iter < ITERS; iter++) {
  let moved = 0;
  for (let i = 0; i < vecs.length; i++) {
    let bestC = 0;
    let bestS = -Infinity;
    for (let c = 0; c < K; c++) {
      const s = dot(vecs[i], centers[c]);
      if (s > bestS) {
        bestS = s;
        bestC = c;
      }
    }
    if (assign[i] !== bestC) {
      assign[i] = bestC;
      moved++;
    }
  }

  const sums = Array.from({ length: K }, () => new Float64Array(DIMS));
  const counts = new Int32Array(K);
  for (let i = 0; i < vecs.length; i++) {
    const c = assign[i];
    counts[c]++;
    const v = vecs[i];
    const s = sums[c];
    for (let d = 0; d < DIMS; d++) s[d] += v[d];
  }
  for (let c = 0; c < K; c++) {
    // 빈 군집은 가장 외로운 점으로 다시 seeding — 안 하면 그 유형이 통째로 사라진다
    if (counts[c] === 0) {
      let worst = 0;
      let worstS = Infinity;
      for (let i = 0; i < vecs.length; i++) {
        const s = dot(vecs[i], centers[assign[i]]);
        if (s < worstS) {
          worstS = s;
          worst = i;
        }
      }
      centers[c] = Float64Array.from(vecs[worst]);
      continue;
    }
    let norm = 0;
    for (let d = 0; d < DIMS; d++) norm += sums[c][d] * sums[c][d];
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < DIMS; d++) centers[c][d] = sums[c][d] / norm;
  }

  console.log(`  iter ${iter + 1}: 이동 ${moved}건`);
  if (moved === 0) break;
}

// 마지막 배정은 **마지막 중심 기준**으로 한 번 더. 루프는 배정 → 중심갱신 순서라,
// 그냥 끝내면 DB에 저장되는 cluster_id가 한 세대 전 중심의 결과가 된다.
// 신규 프로젝트는 refresh.ts가 저장된 중심의 최근접으로 붙이므로, 두 규칙이 어긋나면 안 된다.
for (let i = 0; i < vecs.length; i++) {
  let bestC = 0;
  let bestS = -Infinity;
  for (let c = 0; c < K; c++) {
    const s = dot(vecs[i], centers[c]);
    if (s > bestS) {
      bestS = s;
      bestC = c;
    }
  }
  assign[i] = bestC;
}

// ── 4) 라벨링 — 중심에 가장 가까운 공고 제목을 LLM에게 보여주고 유형명을 받는다 ──
async function labelCluster(c, sampleTitles) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `너는 외주 개발 프로젝트를 유형으로 분류하는 사람이다.
같은 군집으로 묶인 프로젝트 공고 제목들을 보고, 이 군집의 유형명을 한국어로 짓는다.
- 12자 이내 명사구. 예: "쇼핑몰 구축", "기업 홈페이지 리뉴얼", "예약·매칭 플랫폼 앱"
- 목록 전체를 아우르는 이름이어야 한다. 한두 건에만 맞는 이름은 안 된다.
- "기타", "일반", "다양한 프로젝트" 같은 무의미한 이름 금지.
{"label": "유형명"} JSON으로만 답한다.`,
        },
        { role: "user", content: sampleTitles.map((t, i) => `${i + 1}. ${t}`).join("\n") },
      ],
    }),
  });
  if (!res.ok) throw new Error(`라벨링 실패: ${res.status}`);
  const j = await res.json();
  const label = JSON.parse(j.choices[0].message.content).label;
  return typeof label === "string" && label.trim() ? label.trim() : `유형 ${c + 1}`;
}

console.log("라벨링 중…");
const labels = [];
for (let c = 0; c < K; c++) {
  const members = [];
  for (let i = 0; i < vecs.length; i++) if (assign[i] === c) members.push(i);
  members.sort((a, b) => dot(vecs[b], centers[c]) - dot(vecs[a], centers[c]));
  labels[c] = await labelCluster(c, members.slice(0, LABEL_SAMPLES).map((i) => titles[i]));
  console.log(`  #${c} (${members.length}건) → ${labels[c]}`);
}

// ── 5) 저장 ──────────────────────────────────────────────────────────────────
// 재실행이면 이전 배정을 먼저 끊는다 — clusters를 지우려면 FK 참조가 없어야 한다.
console.log("저장 중…");
await sql.query(`UPDATE projects SET cluster_id = NULL WHERE cluster_id IS NOT NULL`);
await sql.query(`DELETE FROM clusters`);

for (let c = 0; c < K; c++) {
  const size = assign.reduce((n, a) => (a === c ? n + 1 : n), 0);
  await sql.query(
    `INSERT INTO clusters (id, label, centroid, size, built_at)
     VALUES ($1, $2, $3::vector, $4, now())`,
    [c, labels[c], `[${Array.from(centers[c]).join(",")}]`, size],
  );
}

// 배정은 클러스터별로 한 번씩 — 6,000건을 한 건씩 UPDATE 하면 왕복만 6,000번이다
for (let c = 0; c < K; c++) {
  const members = ids.filter((_, i) => assign[i] === c);
  for (let i = 0; i < members.length; i += 1000) {
    await sql.query(`UPDATE projects SET cluster_id = $1 WHERE id = ANY($2::bigint[])`, [
      c,
      members.slice(i, i + 1000),
    ]);
  }
}

console.log(`완료 — ${K}개 유형, ${ids.length}건 배정`);
