// 제출→모집 구조화 분석. 본진/Neon 모두 읽기 전용이며 집계 결과에 행 ID·원문을 남기지 않는다.
// 사용: node scripts/analyze-submission-conversion.mjs
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { readEnv } from "./env.mjs";

const sql = neon(readEnv("DATABASE_URL"));
const OUT_DIR = new URL("../analysis/submission-conversion/generated/", import.meta.url);
const PRIVATE_DIR = new URL("../.private/submission-conversion/", import.meta.url);
const DAY = 86_400_000;
const Z = 1.959963984540054;

function pct(value) {
  return Math.round(value * 1000) / 10;
}

function wilson(successes, total) {
  if (!total) return null;
  const p = successes / total;
  const z2 = Z * Z;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const half =
    (Z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denominator;
  return [pct(center - half), pct(center + half)];
}

function newcombe(aSuccess, aTotal, bSuccess, bTotal) {
  if (!aTotal || !bTotal) return null;
  const a = aSuccess / aTotal;
  const b = bSuccess / bTotal;
  const [aLow, aHigh] = wilson(aSuccess, aTotal).map((v) => v / 100);
  const [bLow, bHigh] = wilson(bSuccess, bTotal).map((v) => v / 100);
  const diff = a - b;
  return [
    pct(diff - Math.sqrt((a - aLow) ** 2 + (bHigh - b) ** 2)),
    pct(diff + Math.sqrt((aHigh - a) ** 2 + (b - bLow) ** 2)),
  ];
}

function kstMonth(value) {
  const d = new Date(value);
  d.setTime(d.getTime() + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function recruitmentOutcome(row, days, asOf) {
  const submitted = new Date(row.submitted_at).getTime();
  if (days !== null && asOf - submitted < days * DAY) return null;
  if (!row.recruited_at) {
    if (row.raw_status === "close_recruiting") return null;
    return false;
  }
  const delta = new Date(row.recruited_at).getTime() - submitted;
  if (delta < 0) return null;
  return days === null ? true : delta <= days * DAY;
}

function rateTable(rows, key, outcome) {
  const groups = new Map();
  for (const row of rows) {
    const result = outcome(row);
    if (result === null) continue;
    const label = String(key(row));
    const item = groups.get(label) ?? { label, total: 0, recruited: 0 };
    item.total++;
    if (result) item.recruited++;
    groups.set(label, item);
  }
  const observedTotal = [...groups.values()].reduce((n, g) => n + g.total, 0);
  const observedSuccess = [...groups.values()].reduce((n, g) => n + g.recruited, 0);
  return [...groups.values()]
    .map((g) => {
      const restTotal = observedTotal - g.total;
      const restSuccess = observedSuccess - g.recruited;
      return {
        ...g,
        rate_pct: pct(g.recruited / g.total),
        ci95_pct: wilson(g.recruited, g.total),
        comparison_total: restTotal,
        comparison_recruited: restSuccess,
        difference_pp: restTotal ? pct(g.recruited / g.total - restSuccess / restTotal) : null,
        difference_ci95_pp: newcombe(g.recruited, g.total, restSuccess, restTotal),
      };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function parseTsv(input) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const current = input[i];
    const next = input[i + 1];
    if (current === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (current === "\t" && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((current === "\n" || current === "\r") && !quoted) {
      if (current === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += current;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function readReasonRows() {
  const names = ["rejection-review-2026-07.csv", "rejection-review-2026-08.csv"];
  const rows = [];
  for (const name of names) {
    const path = new URL(name, PRIVATE_DIR);
    if (!fs.existsSync(path)) throw new Error(`원본 CSV 없음: ${path.pathname}`);
    const parsed = parseTsv(fs.readFileSync(path, "utf16le").replace(/^\uFEFF/, ""));
    const header = parsed.shift();
    for (const values of parsed) {
      const record = Object.fromEntries(header.map((column, index) => [column, values[index] ?? ""]));
      if (record["제출 수(도급)"] === "1") rows.push(record);
    }
  }
  return rows;
}

const rows = await sql.query(`
  SELECT project_id, raw_status, is_rejected, is_cancelled, raw_cancel_type,
         submitted_at, recruited_at, rejected_at, cancelled_at, source_extracted_at,
         snapshot_modified_at, initial_description, initial_budget, initial_term_days,
         linked_file_count_at_submit, user_file_count_at_submit,
         prior_task_submissions, prior_task_recruitments,
         prior_task_contracts_reference_only, business_form, acquisition_path,
         first_contract_date_reference_only
    FROM submission_analysis_projects
   ORDER BY project_id
`);

if (rows.length !== 4319) throw new Error(`전체 건수 불일치: ${rows.length} (기대 4319)`);
const byId = new Map(rows.map((row) => [String(row.project_id), row]));
const asOf = Math.max(...rows.map((row) => new Date(row.source_extracted_at).getTime()));
const outcome14 = (row) => recruitmentOutcome(row, 14, asOf);
const historyGroup = (row) => {
  if (row.prior_task_submissions == null) return "unknown";
  if (row.prior_task_submissions >= 3) return "3+";
  return String(row.prior_task_submissions);
};
const hasFile = (row) => (Number(row.linked_file_count_at_submit) > 0 ? "yes" : "no");
const repeat = (row) => (Number(row.prior_task_submissions) > 0 ? "repeat" : "first");

const outcomes = {};
for (const days of [7, 14, 30, null]) {
  const key = days === null ? "cumulative" : `${days}d`;
  let eligible = 0;
  let ineligible = 0;
  let recruited = 0;
  let unknown = 0;
  for (const row of rows) {
    const submitted = new Date(row.submitted_at).getTime();
    if (days !== null && asOf - submitted < days * DAY) {
      ineligible++;
      continue;
    }
    const result = recruitmentOutcome(row, days, asOf);
    if (result === null) unknown++;
    else {
      eligible++;
      if (result) recruited++;
    }
  }
  outcomes[key] = {
    eligible,
    ineligible,
    recruited,
    unknown,
    rate_pct: pct(recruited / eligible),
    observation_bounds_pct: [
      pct(recruited / (eligible + unknown)),
      pct((recruited + unknown) / (eligible + unknown)),
    ],
    ci95_pct_confirmed_only: wilson(recruited, eligible),
  };
}

const verified = rows.filter(
  (row) => row.snapshot_modified_at && new Date(row.snapshot_modified_at) <= new Date(row.submitted_at),
);
const budgetGroup = (row) => {
  const value = Number(row.initial_budget);
  if (!value || value <= 0) return "missing_or_zero";
  if (value < 5_000_000) return "lt_5m";
  if (value < 10_000_000) return "5m_to_10m";
  if (value < 30_000_000) return "10m_to_30m";
  return "30m_plus";
};
const termGroup = (row) => {
  const value = Number(row.initial_term_days);
  if (!value || value <= 0) return "missing_or_zero";
  if (value <= 30) return "1_to_30";
  if (value <= 90) return "31_to_90";
  return "91_plus";
};

const cross = (first, second) =>
  rateTable(rows, (row) => `${first(row)}|${second(row)}`, outcome14);

const reasonRows = readReasonRows();
const reasonCounts = new Map();
const reasonOutcome = new Map();
for (const reason of reasonRows) {
  const project = byId.get(reason["프로젝트 ID"]);
  if (!project) continue;
  const label = reason["부적합 사유"] || "unknown";
  reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
  const outcome = project.recruited_at ? "recruited" : project.is_cancelled ? "cancelled" : "rejected";
  const item = reasonOutcome.get(outcome) ?? {
    outcome,
    total: 0,
    with_file: 0,
    repeat_client: 0,
    corporate: 0,
    individual: 0,
  };
  item.total++;
  if (Number(project.linked_file_count_at_submit) > 0) item.with_file++;
  if (Number(project.prior_task_submissions) > 0) item.repeat_client++;
  if (project.business_form === "corporate_business") item.corporate++;
  if (project.business_form === "individual") item.individual++;
  reasonOutcome.set(outcome, item);
}

const contractEligible = rows.filter(
  (row) => asOf - new Date(row.submitted_at).getTime() >= 90 * DAY,
);

const preRecruitCancelled = rows.filter((row) => !row.recruited_at && row.is_cancelled);
const cancelCodeCounts = new Map();
for (const row of preRecruitCancelled) {
  const code = row.raw_cancel_type?.trim() || "blank";
  cancelCodeCounts.set(code, (cancelCodeCounts.get(code) ?? 0) + 1);
}
const contractedWithin90 = (row) => {
  if (!row.first_contract_date_reference_only) return false;
  const rawDate = row.first_contract_date_reference_only;
  const dateText = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate).slice(0, 10);
  const contracted = new Date(`${dateText}T00:00:00+09:00`).getTime();
  const submitted = new Date(row.submitted_at).getTime();
  const submittedKst = new Date(submitted + 9 * 60 * 60 * 1000);
  const submittedDay = new Date(
    `${submittedKst.getUTCFullYear()}-${String(submittedKst.getUTCMonth() + 1).padStart(2, "0")}-${String(submittedKst.getUTCDate()).padStart(2, "0")}T00:00:00+09:00`,
  ).getTime();
  return contracted >= submittedDay && contracted <= submittedDay + 90 * DAY;
};

const output = {
  as_of: new Date(asOf).toISOString(),
  cohort: { total: rows.length, verified_snapshot: verified.length },
  outcomes,
  monthly_14d: rateTable(rows, (row) => kstMonth(row.submitted_at), outcome14),
  structured_14d: {
    attachment: rateTable(rows, hasFile, outcome14),
    prior_task_submissions: rateTable(rows, historyGroup, outcome14),
    business_form: rateTable(rows, (row) => row.business_form || "unknown", outcome14),
    acquisition_path: rateTable(rows, (row) => row.acquisition_path || "unknown", outcome14),
    attachment_by_history: cross(historyGroup, hasFile),
    business_form_by_customer_history: cross(repeat, (row) => row.business_form || "unknown"),
  },
  verified_snapshot_14d: {
    description_available: rateTable(
      verified,
      (row) => (row.initial_description?.trim() ? "yes" : "no"),
      outcome14,
    ),
    budget: rateTable(verified, budgetGroup, outcome14),
    term: rateTable(verified, termGroup, outcome14),
  },
  reason_sample: {
    provided_rows: reasonRows.length,
    matched_rows: reasonRows.filter((row) => byId.has(row["프로젝트 ID"])).length,
    reason_counts: [...reasonCounts.entries()]
      .map(([reason, total]) => ({ reason, total }))
      .sort((a, b) => b.total - a.total || a.reason.localeCompare(b.reason)),
    outcomes: [...reasonOutcome.values()].sort((a, b) => b.total - a.total),
  },
  pre_recruit_cancellation_codes: {
    total: preRecruitCancelled.length,
    add_mistake: preRecruitCancelled.filter((row) => row.raw_cancel_type?.trim() === "add_mistake").length,
    explicit_test: preRecruitCancelled.filter((row) => row.raw_cancel_type?.includes("테스트")).length,
    counts: [...cancelCodeCounts.entries()]
      .map(([code, total]) => ({ code, total }))
      .sort((a, b) => b.total - a.total || a.code.localeCompare(b.code)),
  },
  contract_90d_reference_only: {
    eligible: contractEligible.length,
    contracted: contractEligible.filter(contractedWithin90).length,
    by_attachment: rateTable(contractEligible, hasFile, contractedWithin90),
    by_history: rateTable(contractEligible, historyGroup, contractedWithin90),
  },
};

if (output.outcomes.cumulative.recruited !== 1932) {
  throw new Error(`누적 모집 건수 불일치: ${output.outcomes.cumulative.recruited} (기대 1932)`);
}
if (output.reason_sample.matched_rows !== 646) {
  throw new Error(`CSV 매칭 건수 불일치: ${output.reason_sample.matched_rows} (기대 646)`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(new URL("structured-results.json", OUT_DIR), `${JSON.stringify(output, null, 2)}\n`);
console.log(
  `완료: 전체 ${rows.length}, 14일 모집 ${outcomes["14d"].recruited}/${outcomes["14d"].eligible}, CSV ${output.reason_sample.matched_rows}`,
);
