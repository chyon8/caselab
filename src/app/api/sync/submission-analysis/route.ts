import { transaction } from "@/lib/db";
import { requireSyncKey } from "@/lib/sync/auth";
import { scrubPii } from "@/lib/sync/pii";
import { SAVE_CURSOR_SQL } from "@/lib/sync/sync-state";
import { valuesClause } from "@/lib/sync/sql";

const SOURCE = "submission_analysis_2026_01_08";
const PAGE_SIZE = 200;

interface RawAnalysisProject {
  project_id: number | string;
  previous_project_id?: number | string | null;
  title?: string | null;
  raw_status?: string | null;
  is_rejected?: number | boolean | null;
  is_cancelled?: number | boolean | null;
  raw_cancel_type?: string | null;
  cancel_reason?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
  recruited_at?: string | null;
  rejected_at?: string | null;
  cancelled_at?: string | null;
  deleted_at?: string | null;
  source_modified_at?: string | null;
  source_extracted_at?: string | null;
  hidden?: number | boolean | null;
  initial_snapshot_id?: number | string | null;
  initial_description?: string | null;
  initial_budget?: number | string | null;
  initial_term_days?: number | string | null;
  snapshot_created_at?: string | null;
  snapshot_modified_at?: string | null;
  categories?: string | null;
  representative_field?: string | null;
  is_turnkey?: number | boolean | null;
  submit_purpose?: string | null;
  project_has_manage_experience?: number | boolean | null;
  business_form?: string | null;
  acquisition_path?: string | null;
  project_purpose?: string | null;
  plan_status?: string | null;
  detail_plan_status?: string | null;
  budget_option?: string | null;
  term_option?: string | null;
  launch_date?: string | null;
  max_launch_date?: string | null;
  launch_date_option?: string | null;
  inside_manpower?: number | boolean | null;
  detail_inside_manpower?: string | null;
  is_supporting_project?: number | boolean | null;
  supporting_project?: string | null;
  is_support_cost?: number | boolean | null;
  detail_has_manage_experience?: number | boolean | null;
  qualification?: string | null;
  pre_question?: string | null;
  priority?: string | null;
  future_plan?: string | null;
  linked_file_count_at_submit?: number | string | null;
  user_file_count_at_submit?: number | string | null;
  user_file_bytes_at_submit?: number | string | null;
  prior_platform_submissions?: number | string | null;
  prior_platform_recruitments?: number | string | null;
  prior_task_submissions?: number | string | null;
  prior_task_recruitments?: number | string | null;
  prior_task_contracts_reference_only?: number | string | null;
  is_first_client_project_in_cohort?: number | boolean | null;
  first_contract_date_reference_only?: string | null;
}

const COLS = [
  "project_id", "previous_project_id", "title", "raw_status", "is_rejected",
  "is_cancelled", "raw_cancel_type", "cancel_reason", "created_at", "submitted_at",
  "recruited_at", "rejected_at", "cancelled_at", "deleted_at", "source_modified_at",
  "source_extracted_at", "hidden", "initial_snapshot_id", "initial_description",
  "initial_budget", "initial_term_days", "snapshot_created_at", "snapshot_modified_at",
  "categories", "representative_field", "is_turnkey", "submit_purpose",
  "project_has_manage_experience", "business_form", "acquisition_path", "project_purpose",
  "plan_status", "detail_plan_status", "budget_option", "term_option", "launch_date",
  "max_launch_date", "launch_date_option", "inside_manpower", "detail_inside_manpower",
  "is_supporting_project", "supporting_project", "is_support_cost",
  "detail_has_manage_experience", "qualification", "pre_question", "priority", "future_plan",
  "linked_file_count_at_submit", "user_file_count_at_submit", "user_file_bytes_at_submit",
  "prior_platform_submissions", "prior_platform_recruitments", "prior_task_submissions",
  "prior_task_recruitments", "prior_task_contracts_reference_only",
  "is_first_client_project_in_cohort", "first_contract_date_reference_only",
] as const;

function bool(value: number | boolean | null | undefined): boolean | null {
  if (value === null || value === undefined) return null;
  return value === true || value === 1;
}

function number(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: string | null | undefined): string | null {
  return value == null ? null : scrubPii(value);
}

function mapRow(row: RawAnalysisProject): unknown[] | null {
  const id = number(row.project_id);
  if (!Number.isInteger(id) || id === null || id <= 0 || !row.source_extracted_at) return null;

  return [
    id, number(row.previous_project_id), text(row.title), row.raw_status ?? null,
    bool(row.is_rejected), bool(row.is_cancelled), row.raw_cancel_type ?? null,
    text(row.cancel_reason), row.created_at ?? null, row.submitted_at ?? null,
    row.recruited_at ?? null, row.rejected_at ?? null, row.cancelled_at ?? null,
    row.deleted_at ?? null, row.source_modified_at ?? null, row.source_extracted_at,
    bool(row.hidden), number(row.initial_snapshot_id), text(row.initial_description),
    number(row.initial_budget), number(row.initial_term_days), row.snapshot_created_at ?? null,
    row.snapshot_modified_at ?? null, text(row.categories), text(row.representative_field),
    bool(row.is_turnkey), row.submit_purpose ?? null, bool(row.project_has_manage_experience),
    row.business_form ?? null, row.acquisition_path ?? null, row.project_purpose ?? null,
    row.plan_status ?? null, text(row.detail_plan_status), row.budget_option ?? null,
    row.term_option ?? null, row.launch_date ?? null, row.max_launch_date ?? null,
    row.launch_date_option ?? null, bool(row.inside_manpower), text(row.detail_inside_manpower),
    bool(row.is_supporting_project), row.supporting_project ?? null, bool(row.is_support_cost),
    bool(row.detail_has_manage_experience), text(row.qualification), text(row.pre_question),
    row.priority ?? null, text(row.future_plan), number(row.linked_file_count_at_submit),
    number(row.user_file_count_at_submit), number(row.user_file_bytes_at_submit),
    number(row.prior_platform_submissions), number(row.prior_platform_recruitments),
    number(row.prior_task_submissions), number(row.prior_task_recruitments),
    number(row.prior_task_contracts_reference_only), bool(row.is_first_client_project_in_cohort),
    row.first_contract_date_reference_only ?? null,
  ];
}

export async function POST(req: Request): Promise<Response> {
  const denied = requireSyncKey(req);
  if (denied) return denied;

  let body: { rows?: RawAnalysisProject[] };
  try {
    body = (await req.json()) as { rows?: RawAnalysisProject[] };
  } catch {
    return Response.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }

  const rows = body.rows;
  if (!Array.isArray(rows)) {
    return Response.json({ error: "rows 배열이 필요합니다." }, { status: 400 });
  }
  if (rows.length > PAGE_SIZE) {
    return Response.json(
      { error: `배치는 최대 ${PAGE_SIZE}건입니다. (받은 건수: ${rows.length})` },
      { status: 400 },
    );
  }
  if (rows.length === 0) {
    return Response.json({ received: 0, upserted: 0, skipped: 0, done: true });
  }

  const byId = new Map<number, unknown[]>();
  let skipped = 0;
  for (const row of rows) {
    const mapped = mapRow(row);
    if (!mapped) {
      skipped++;
      continue;
    }
    byId.set(mapped[0] as number, mapped);
  }
  const mappedRows = [...byId.values()];
  if (mappedRows.length === 0) {
    return Response.json({ received: rows.length, upserted: 0, skipped, done: false });
  }

  const updates = COLS.filter((column) => column !== "project_id")
    .map((column) => `${column} = EXCLUDED.${column}`)
    .join(", ");
  const lastId = Math.max(...mappedRows.map((row) => row[0] as number));
  const extractedAt = String(mappedRows.find((row) => row[0] === lastId)?.[15]);
  const cursor = `${extractedAt}|${lastId}`;
  const params = mappedRows.flat();

  await transaction([
    {
      text: `INSERT INTO submission_analysis_projects (${COLS.join(", ")})
             VALUES ${valuesClause(mappedRows.length, COLS.length)}
             ON CONFLICT (project_id) DO UPDATE SET ${updates}, ingested_at = now()`,
      params,
    },
    { text: SAVE_CURSOR_SQL, params: [SOURCE, cursor] },
  ]);

  return Response.json({
    received: rows.length,
    upserted: mappedRows.length,
    skipped,
    cursor,
    done: rows.length < PAGE_SIZE,
  });
}
