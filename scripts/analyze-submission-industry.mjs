// 제출 원문 859건의 업종군·시스템 유형 판정(industry-service/labels)과 14일 모집 전환을 대조한다.
// 교란 변수(첨부·과거 제출·사업 형태)는 Neon 분석 원장에서 읽기만 하며, 결과에는 집계만 남긴다.
// 사용: node scripts/analyze-submission-industry.mjs
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { readEnv } from "./env.mjs";

const ROOT = new URL("../analysis/submission-conversion/", import.meta.url);
const LABELS = new URL("industry-service/labels/", ROOT);
const OUT = new URL("generated/industry-service-results.json", ROOT);
const MAP = new URL("../.private/submission-conversion/text-sample-map.json", import.meta.url);
const Z = 1.959963984540054;
const MIN_N = 20;

const pct = (v) => Math.round(v * 1000) / 10;
function wilson(k, n) {
  if (!n) return null;
  const p = k / n;
  const d = 1 + (Z * Z) / n;
  const c = (p + (Z * Z) / (2 * n)) / d;
  const h = (Z * Math.sqrt((p * (1 - p) + (Z * Z) / (4 * n)) / n)) / d;
  return [pct(c - h), pct(c + h)];
}
function newcombe(a, an, b, bn) {
  const [al, ah] = wilson(a, an).map((v) => v / 100);
  const [bl, bh] = wilson(b, bn).map((v) => v / 100);
  const pa = a / an;
  const pb = b / bn;
  return [pct(pa - pb - Math.sqrt((pa - al) ** 2 + (bh - pb) ** 2)), pct(pa - pb + Math.sqrt((ah - pa) ** 2 + (pb - bl) ** 2))];
}

const labels = fs
  .readdirSync(LABELS)
  .sort()
  .flatMap((f) => fs.readFileSync(new URL(f, LABELS), "utf8").split("\n").filter(Boolean))
  .map((line) => {
    const [id, industry, system] = line.split("\t");
    return { id, industry, system };
  });
const outcome = new Map(
  JSON.parse(fs.readFileSync(new URL("review/analysis-targets.json", ROOT), "utf8")).map((r) => [r.anon_id, r.recruited_within_14d]),
);
const projectOf = new Map(JSON.parse(fs.readFileSync(MAP, "utf8")).map((r) => [r.anon_id, String(r.project_id)]));

const sql = neon(readEnv("DATABASE_URL"));
const ledger = new Map(
  (
    await sql.query(
      `SELECT project_id, linked_file_count_at_submit, prior_task_submissions, business_form
         FROM submission_analysis_projects WHERE project_id = ANY($1)`,
      [[...projectOf.values()].map(Number)],
    )
  ).map((r) => [String(r.project_id), r]),
);

const rows = labels.map((l) => {
  const src = ledger.get(projectOf.get(l.id));
  if (!src) throw new Error(`원장 누락: ${l.id}`);
  if (typeof outcome.get(l.id) !== "boolean") throw new Error(`결과 누락: ${l.id}`);
  const form = src.business_form === "corporate_business" ? "법인" : src.business_form === "individual" ? "개인" : "기타·미상";
  return {
    ...l,
    recruited: outcome.get(l.id),
    stratum: [Number(src.linked_file_count_at_submit) > 0 ? "첨부" : "무첨부", Number(src.prior_task_submissions) > 0 ? "재방문" : "신규", form].join("|"),
    form,
  };
});

/** 층(첨부×신규/재방문×사업형태)별 차이를 가중 평균한 Mantel-Haenszel 위험차(%p). */
function mhDiff(inGroup, pool) {
  let num = 0;
  let den = 0;
  const strata = new Map();
  for (const r of pool) {
    const s = strata.get(r.stratum) ?? { a: 0, an: 0, b: 0, bn: 0 };
    if (inGroup(r)) (s.an++, (s.a += r.recruited));
    else (s.bn++, (s.b += r.recruited));
    strata.set(r.stratum, s);
  }
  for (const s of strata.values()) {
    const n = s.an + s.bn;
    if (!s.an || !s.bn) continue;
    num += (s.a * s.bn - s.b * s.an) / n;
    den += (s.an * s.bn) / n;
  }
  return den ? pct(num / den) : null;
}

function table(key, pool) {
  const total = pool.length;
  const hits = pool.filter((r) => r.recruited).length;
  const groups = Map.groupBy(pool, (r) => r[key]);
  return [...groups]
    .map(([name, g]) => {
      const k = g.filter((r) => r.recruited).length;
      const out = { name, n: g.length, recruited: k, rate_pct: pct(k / g.length), ci95: wilson(k, g.length) };
      if (g.length >= MIN_N && total - g.length >= MIN_N) {
        out.diff_vs_rest_pctp = pct(k / g.length - (hits - k) / (total - g.length));
        out.diff_ci95 = newcombe(k, g.length, hits - k, total - g.length);
        out.adjusted_diff_pctp = mhDiff((r) => r[key] === name, pool);
      }
      return out;
    })
    .sort((a, b) => b.n - a.n);
}

function rate(g) {
  const k = g.filter((r) => r.recruited).length;
  return { n: g.length, recruited: k, rate_pct: pct(k / g.length), ci95: wilson(k, g.length) };
}
/** 두 집단 비교: 단순 차이와 층화 보정 차이(a − b). */
function compare(a, b) {
  const ak = a.filter((r) => r.recruited).length;
  const bk = b.filter((r) => r.recruited).length;
  const inA = new Set(a);
  return {
    a: rate(a),
    b: rate(b),
    diff_pctp: pct(ak / a.length - bk / b.length),
    diff_ci95: newcombe(ak, a.length, bk, b.length),
    adjusted_diff_pctp: mhDiff((r) => inA.has(r), [...a, ...b]),
  };
}
const content = rows.filter((r) => r.system !== "미상");
const industryKnown = content.filter((r) => r.industry !== "미상");

const cross = [...Map.groupBy(industryKnown, (r) => `${r.industry} × ${r.system}`)]
  .filter(([, g]) => g.length >= 8)
  .map(([name, g]) => ({ name, ...rate(g) }))
  .sort((a, b) => b.n - a.n);

const result = {
  note: "제출 전 원문 859건 표본. 14일 내 모집 전환. adjusted_diff_pctp는 첨부×신규/재방문×사업형태 층화 Mantel-Haenszel 위험차. 1인(AI) 판정, 재제출 건 포함.",
  overall: rate(rows),
  coverage: {
    empty_or_unclear: rate(rows.filter((r) => r.system === "미상")),
    with_content: rate(content),
    industry_known: rate(industryKnown),
    industry_unknown_with_content: rate(content.filter((r) => r.industry === "미상")),
  },
  /** a: 내용 있음 vs b: 빈 양식 / a: 업종 드러남 vs b: 내용은 있으나 업종 미상 */
  content_vs_empty: compare(content, rows.filter((r) => r.system === "미상")),
  industry_known_vs_unknown: compare(industryKnown, content.filter((r) => r.industry === "미상")),
  by_system: table("system", content),
  /** AI 세 유형은 각각 20건대라 묶어서도 본다. */
  by_system_ai_grouped: table(
    "group",
    content.map((r) => ({ ...r, group: r.system.startsWith("AI ") ? "AI 3종" : "그 외" })),
  ),
  by_industry: table("industry", industryKnown),
  cross_min8: cross,
};
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 1));
