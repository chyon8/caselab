// 고유 수요 단위(units.json)에 공고별 판정(labels/*.tsv), 업무 표기 병합 규칙(merge-rules.tsv),
// 개별 수정(label-overrides.tsv)을 적용해 전체 원장(ledger.json)을 만든다.
// 세부 표기(업종·업무·시스템)는 너무 잘게 갈라져 같은 수요가 흩어지므로, 업종군(rollup-industry.tsv)
// × 시스템 유형(rollup-system.tsv)으로 올려 그룹을 만든다. 세부 표기는 detailKey로 남긴다.
// 외부 AI API를 호출하지 않는다. 판정 자체는 원문을 읽고 사람이 기록한 labels 파일에 있다.
import fs from "node:fs";

const V2 = new URL("../.private/target-demand/v2/", import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, V2), "utf8");
const tsv = (text) => text.split("\n").filter((line) => line.trim() && !line.startsWith("#")).map((line) => line.split("\t"));

const units = JSON.parse(read("units.json"));
const outcomes = new Map(JSON.parse(read("outcomes.json")).map((row) => [row.id, row]));

const labels = new Map();
for (const file of fs.readdirSync(new URL("labels/", V2)).filter((name) => name.endsWith(".tsv")).sort()) {
  for (const [id, industry, problem, system, note = ""] of tsv(read(`labels/${file}`))) {
    if (labels.has(id)) throw new Error(`판정 중복: ${id}`);
    labels.set(id, { industry, problem, system, note });
  }
}

const rules = new Map();
for (const [industry, system, from, to] of tsv(read("merge-rules.tsv"))) {
  for (const problem of from.split("|")) rules.set(`${industry}\u0000${system}\u0000${problem}`, to);
}
const review = JSON.parse(read("dup-review.json"));
/** 별개 과업이지만 같은 발주처로 판단한 공고는 발주처 수를 셀 때 한 곳으로 본다. */
const clientAlias = new Map((review.same_client ?? []).map(([a, b]) => [b, a]));
/** "상위\t세부|세부" 형식. 원장에 나온 세부 표기가 빠지면 멈춘다. */
const rollup = (name) => new Map(tsv(read(name)).flatMap(([group, members]) => members.split("|").map((member) => [member, group])));
const industryGroups = rollup("rollup-industry.tsv");
const systemTypes = rollup("rollup-system.tsv");
const overrides = new Map(tsv(read("label-overrides.tsv")).map(([id, industry, problem, system, note]) => [id, { industry, problem, system, note }]));

const ledger = units.map(({ unit, ids }) => {
  if (!labels.has(unit)) throw new Error(`판정 누락: ${unit}`);
  /** 그룹 검증에서 원문을 다시 확인해 고친 판정이 있으면 그것을 쓴다. */
  const override = overrides.get(unit);
  const label = override ?? labels.get(unit);
  if (label.industry === "X" || label.industry === "A") {
    return { unit, ids, status: label.industry === "X" ? "excluded" : "ambiguous", reason: label.note };
  }
  let { industry, problem, system } = label;
  problem = rules.get(`${industry}\u0000${system}\u0000${problem}`) ?? rules.get(`*\u0000${system}\u0000${problem}`) ?? problem;
  if (!industryGroups.has(industry)) throw new Error(`업종군 매핑 누락: ${industry}`);
  if (!systemTypes.has(system)) throw new Error(`시스템 유형 매핑 누락: ${system}`);
  return {
    unit, ids, industry, problem, system,
    industryGroup: industryGroups.get(industry),
    systemType: systemTypes.get(system),
    detailKey: [industry, problem, system].join(" × "),
    override: override?.note,
  };
});

/** 업종군 × 시스템 유형이 같은 수요를 모으되, 발주처가 한 곳뿐이면 그룹이 아니라 단건으로 본다. */
const byKey = new Map();
for (const row of ledger.filter((row) => row.industry)) {
  const key = [row.industryGroup, row.systemType].join(" × ");
  byKey.set(key, [...(byKey.get(key) ?? []), row]);
}
for (const [key, rows] of byKey) {
  const clientOf = (id) => {
    const base = clientAlias.get(id) ?? id;
    return outcomes.get(base).client_name?.trim() || `unknown:${base}`;
  };
  const clients = new Set(rows.map((row) => clientOf(row.unit)));
  for (const row of rows) {
    row.key = key;
    row.status = rows.length >= 2 && clients.size >= 2 ? "group" : "single";
    if (rows.length >= 2 && clients.size < 2) row.reason = "같은 발주처의 반복 수요만 있어 단건 처리";
  }
}

fs.writeFileSync(new URL("ledger.json", V2), JSON.stringify(ledger, null, 1));
const count = (status) => ledger.filter((row) => row.status === status);
const groups = new Set(count("group").map((row) => row.key));
console.log({
  units: ledger.length,
  postings: ledger.reduce((n, row) => n + row.ids.length, 0),
  group: count("group").length,
  groupPostings: count("group").reduce((n, row) => n + row.ids.length, 0),
  groups: groups.size,
  single: count("single").length,
  ambiguous: count("ambiguous").length,
  excluded: count("excluded").length,
  unassigned: ledger.filter((row) => !row.status).length,
});
