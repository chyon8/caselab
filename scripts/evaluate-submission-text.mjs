// 두 사람의 블라인드 판독과 AI 결과를 집계한다. 원문·행 ID는 출력하지 않는다.
// 사용: node scripts/evaluate-submission-text.mjs calibration|validation
import fs from "node:fs";

const SCOPE = process.argv[2] ?? "validation";
if (!["calibration", "validation"].includes(SCOPE)) throw new Error(`범위 오류: ${SCOPE}`);

const REVIEW_DIR = new URL("../analysis/submission-conversion/review/", import.meta.url);
const OUT_DIR = new URL("../analysis/submission-conversion/generated/", import.meta.url);
const SINGLE_FIELDS = [
  "purpose_context",
  "function_specificity",
  "scope_definition",
  "project_mode",
  "existing_system_or_integration",
];

function readTsv(path) {
  const lines = fs.readFileSync(path, "utf8").trimEnd().split("\n");
  const header = lines.shift().split("\t");
  return new Map(
    lines.map((line) => {
      const values = line.split("\t");
      const record = Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""]));
      return [record.anon_id, record];
    }),
  );
}

function kappa(a, b) {
  if (!a.length) return null;
  const labels = [...new Set([...a, ...b])];
  const agreement = a.filter((value, index) => value === b[index]).length / a.length;
  const expected = labels.reduce((sum, label) => {
    const pa = a.filter((value) => value === label).length / a.length;
    const pb = b.filter((value) => value === label).length / b.length;
    return sum + pa * pb;
  }, 0);
  if (expected === 1) return null;
  return Math.round(((agreement - expected) / (1 - expected)) * 1000) / 1000;
}

function pct(value) {
  return Math.round(value * 1000) / 10;
}

function artifactSet(value) {
  return new Set(
    String(value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

const reviewerA = readTsv(new URL(`${SCOPE}-reviewer-a.tsv`, REVIEW_DIR));
const reviewerB = readTsv(new URL(`${SCOPE}-reviewer-b.tsv`, REVIEW_DIR));
const aiPath = new URL(`ai-${SCOPE}.jsonl`, REVIEW_DIR);
const ai = new Map();
if (fs.existsSync(aiPath)) {
  for (const line of fs.readFileSync(aiPath, "utf8").split("\n").filter(Boolean)) {
    const record = JSON.parse(line);
    ai.set(record.anon_id, record.result);
  }
}

const metrics = {};
for (const field of SINGLE_FIELDS) {
  const pairs = [...reviewerA.keys()]
    .map((id) => ({ id, a: reviewerA.get(id)?.[field]?.trim(), b: reviewerB.get(id)?.[field]?.trim() }))
    .filter((item) => item.a && item.b);
  const agreed = pairs.filter((item) => item.a === item.b);
  const aiComparable = agreed.filter((item) => ai.has(item.id));
  metrics[field] = {
    completed_pairs: pairs.length,
    agreement_pct: pairs.length ? pct(agreed.length / pairs.length) : null,
    kappa: kappa(
      pairs.map((item) => item.a),
      pairs.map((item) => item.b),
    ),
    ai_vs_agreed_n: aiComparable.length,
    ai_accuracy_pct: aiComparable.length
      ? pct(aiComparable.filter((item) => String(ai.get(item.id)[field]) === item.a).length / aiComparable.length)
      : null,
  };
}

const artifactLabels = ["requirements", "screen_design", "reference", "existing_data", "api_spec", "other"];
const artifactPairs = [...reviewerA.keys()]
  .map((id) => ({
    id,
    a: artifactSet(reviewerA.get(id)?.preparation_artifacts),
    b: artifactSet(reviewerB.get(id)?.preparation_artifacts),
  }))
  .filter((item) => reviewerA.get(item.id)?.preparation_artifacts != null && reviewerB.get(item.id)?.preparation_artifacts != null);

metrics.preparation_artifacts = {
  completed_pairs: artifactPairs.length,
  exact_agreement_pct: artifactPairs.length
    ? pct(artifactPairs.filter((item) => [...item.a].sort().join() === [...item.b].sort().join()).length / artifactPairs.length)
    : null,
  by_label: Object.fromEntries(
    artifactLabels.map((label) => {
      const a = artifactPairs.map((item) => String(item.a.has(label)));
      const b = artifactPairs.map((item) => String(item.b.has(label)));
      const agreed = artifactPairs.filter((item) => item.a.has(label) === item.b.has(label));
      const aiComparable = agreed.filter((item) => ai.has(item.id));
      let tp = 0;
      let fp = 0;
      let fn = 0;
      for (const item of aiComparable) {
        const truth = item.a.has(label);
        const predicted = ai.get(item.id).preparation_artifacts.includes(label);
        if (truth && predicted) tp++;
        else if (!truth && predicted) fp++;
        else if (truth && !predicted) fn++;
      }
      return [label, {
        positive_agreed: agreed.filter((item) => item.a.has(label)).length,
        agreement_pct: artifactPairs.length ? pct(agreed.length / artifactPairs.length) : null,
        kappa: kappa(a, b),
        ai_precision_pct: tp + fp ? pct(tp / (tp + fp)) : null,
        ai_recall_pct: tp + fn ? pct(tp / (tp + fn)) : null,
      }];
    }),
  ),
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(new URL(`text-validation-${SCOPE}.json`, OUT_DIR), `${JSON.stringify(metrics, null, 2)}\n`);
console.log(JSON.stringify(metrics, null, 2));
