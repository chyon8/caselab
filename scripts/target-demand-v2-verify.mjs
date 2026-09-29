// 타깃 수요 원장(ledger.json)의 불변식을 검증한다. 하나라도 어기면 종료 코드 1.
import fs from "node:fs";

const DIR = new URL("../.private/target-demand/", import.meta.url);
const V2 = new URL("v2/", DIR);
const eligible = fs.readFileSync(new URL("extractions.jsonl", DIR), "utf8").split("\n").filter(Boolean)
  .map((line) => JSON.parse(line)).filter((row) => row.result?.eligible === true).map((row) => row.id);
const ledger = JSON.parse(fs.readFileSync(new URL("ledger.json", V2), "utf8"));
const outcomes = new Map(JSON.parse(fs.readFileSync(new URL("outcomes.json", V2), "utf8")).map((row) => [row.id, row]));

const errors = [];
const seen = new Map();
for (const row of ledger) for (const id of row.ids) seen.set(id, (seen.get(id) ?? 0) + 1);
const missing = eligible.filter((id) => !seen.has(id));
const duplicated = [...seen].filter(([, n]) => n > 1).map(([id]) => id);
const extra = [...seen.keys()].filter((id) => !eligible.includes(id));
if (missing.length) errors.push(`누락 ${missing.length}건`);
if (duplicated.length) errors.push(`중복 배정 ${duplicated.length}건`);
if (extra.length) errors.push(`대상 밖 ${extra.length}건`);

const statuses = new Set(["group", "single", "ambiguous", "excluded"]);
for (const row of ledger) {
  if (!statuses.has(row.status)) errors.push(`상태 없음 ${row.unit}`);
  if ((row.status === "ambiguous" || row.status === "excluded") && !row.reason) errors.push(`사유 없음 ${row.unit}`);
  if ((row.status === "group" || row.status === "single") && !(row.industry && row.problem && row.system)) errors.push(`세 축 누락 ${row.unit}`);
}
const groups = new Map();
for (const row of ledger.filter((row) => row.status === "group")) groups.set(row.key, [...(groups.get(row.key) ?? []), row]);
for (const [key, rows] of groups) if (rows.length < 2) errors.push(`1건짜리 그룹 ${key}`);

const count = (status) => ledger.filter((row) => row.status === status);
const postings = (rows) => rows.reduce((n, row) => n + row.ids.length, 0);
console.log({
  eligiblePostings: eligible.length,
  assignedPostings: seen.size,
  missing: missing.length,
  units: ledger.length,
  dedupRemoved: eligible.length - ledger.length,
  group: { units: count("group").length, postings: postings(count("group")), groups: groups.size },
  single: { units: count("single").length, postings: postings(count("single")) },
  ambiguous: { units: count("ambiguous").length, postings: postings(count("ambiguous")) },
  excluded: { units: count("excluded").length, postings: postings(count("excluded")) },
  outcomesCovered: ledger.every((row) => outcomes.has(row.unit)),
});
if (errors.length) {
  console.error(errors);
  process.exit(1);
}
console.log("검증 통과");
