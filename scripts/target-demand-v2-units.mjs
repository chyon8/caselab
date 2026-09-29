// eligible 공고를 재등록 중복 검토 결과(dup-review.json)로 합쳐 고유 수요 단위(units.json)를 만든다.
// 후보쌍 중 separate로 기록한 쌍만 분리하고 나머지는 같은 프로젝트로 합친다. merge_extra는 추가 병합.
import fs from "node:fs";

const DIR = new URL("../.private/target-demand/", import.meta.url);
const V2 = new URL("v2/", DIR);
const readJsonl = (name) => fs.readFileSync(new URL(name, DIR), "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));

const extractions = new Map(readJsonl("extractions.jsonl").filter((row) => row.result?.eligible === true).map((row) => [row.id, row.result]));
const outcomes = new Map(JSON.parse(fs.readFileSync(new URL("outcomes.json", V2), "utf8")).map((row) => [row.id, row]));
const candidates = JSON.parse(fs.readFileSync(new URL("dup-candidates.json", V2), "utf8"));
const review = JSON.parse(fs.readFileSync(new URL("dup-review.json", V2), "utf8"));
const separate = new Set(review.separate.map(([a, b]) => [a, b].sort().join("|")));

const parent = new Map([...extractions.keys()].map((id) => [id, id]));
const find = (id) => (parent.get(id) === id ? id : find(parent.get(id)));
for (const [a, b] of candidates) {
  if (separate.has([a, b].sort().join("|"))) continue;
  parent.set(find(a), find(b));
}
/** 그룹 내부 검증에서 추가로 찾은 재등록(후보쌍 밖)도 합친다. */
for (const [a, b] of review.merge_extra ?? []) parent.set(find(a), find(b));
for (const [a, b] of review.separate) {
  if (find(a) === find(b)) throw new Error(`분리 기록한 ${a}-${b}가 다른 쌍을 거쳐 합쳐졌다`);
}

const rank = (row) => (row.stage >= 3 && row.status !== "완료(취소)" ? 2 : row.stage >= 3 || row.status === "완료(취소)" ? 1 : 0);
const sets = new Map();
for (const id of extractions.keys()) {
  const root = find(id);
  sets.set(root, [...(sets.get(root) ?? []), id]);
}
const units = [...sets.values()].map((ids) => {
  const sorted = [...ids].sort((a, b) => rank(outcomes.get(b)) - rank(outcomes.get(a))
    || outcomes.get(b).recruit_started_at.localeCompare(outcomes.get(a).recruit_started_at));
  return { unit: sorted[0], ids: sorted };
}).sort((a, b) => a.unit.localeCompare(b.unit));

fs.writeFileSync(new URL("units.json", V2), JSON.stringify(units, null, 1));
console.log({ postings: extractions.size, units: units.length, merged: extractions.size - units.length, covered: units.reduce((n, u) => n + u.ids.length, 0) });
