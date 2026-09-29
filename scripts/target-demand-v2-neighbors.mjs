// 저장된 공고 임베딩으로 공고별 코사인 상위 이웃을 구한다. 후보 탐색 전용 — 최종 분류에 쓰지 않는다.
import fs from "node:fs";

const OUT = new URL("../.private/target-demand/v2/", import.meta.url);
const K = 15;
const rows = fs.readFileSync(new URL("embeddings.jsonl", OUT), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const dim = rows[0].v.length;
const mat = new Float32Array(rows.length * dim);
rows.forEach((row, i) => {
  const norm = Math.hypot(...row.v);
  row.v.forEach((x, j) => { mat[i * dim + j] = x / norm; });
});

const neighbors = {};
for (let i = 0; i < rows.length; i++) {
  const top = [];
  for (let j = 0; j < rows.length; j++) {
    if (i === j) continue;
    let dot = 0;
    for (let d = 0; d < dim; d++) dot += mat[i * dim + d] * mat[j * dim + d];
    if (top.length < K || dot > top[top.length - 1][1]) {
      top.push([rows[j].id, dot]);
      top.sort((a, b) => b[1] - a[1]);
      if (top.length > K) top.pop();
    }
  }
  neighbors[rows[i].id] = top.map(([id, s]) => [id, Math.round(s * 1000) / 1000]);
}
fs.writeFileSync(new URL("neighbors.json", OUT), JSON.stringify(neighbors));
console.log({ items: rows.length, k: K });
