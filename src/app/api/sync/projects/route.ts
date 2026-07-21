import { query, transaction } from "@/lib/db";
import { MAX_BATCH, requireSyncKey } from "@/lib/sync/auth";
import { formatCursor, maxByCursor } from "@/lib/sync/cursor";
import { readCursor, SAVE_CURSOR_SQL } from "@/lib/sync/sync-state";
import { mapProject, type MappedProject, type RawProject } from "@/lib/sync/mapping";
import { valuesClause } from "@/lib/sync/sql";
import { notifySlack, projectHyperlink } from "@/lib/notify-slack";
import { managerSlackTag } from "@/lib/managers";

/** projects 테이블 적재 컬럼 (MappedProject의 키와 1:1) */
const COLS = [
  "id",
  "title",
  "client_name",
  "category",
  "dev_scope",
  "is_turnkey",
  "planning_status",
  "proposal_count",
  "tech",
  "budget",
  "budget_monthly",
  "term_days",
  "initial_budget",
  "initial_term_days",
  "status",
  "stage",
  "inspection_manager",
  "manager_ids",
  "agreement_id",
  "contract_amount",
  "contract_term_days",
  "deadline_at",
  "submitted_at",
  "recruit_started_at",
  "progress_started_at",
  "completed_at",
  "cancelled_at",
  "rejected_at",
  "cancel_stage",
  "cancel_reason",
  "posting_raw",
  "content_hash",
  "deleted_at",
  "hidden",
  "source_modified_at",
] as const satisfies readonly (keyof MappedProject)[];

/** 변경 감지 대상 필드 (§5) */
const CHANGE_LABEL: Record<string, string> = {
  status: "상태 변경",
  budget: "예산 변경",
  term_days: "기간 변경",
  contract_amount: "계약금액 변경",
  manager: "담당 매니저 변경",
  deadline: "모집 마감일 변경",
};

/** NUMERIC은 pg에서 문자열로 돌아온다 */
interface ExistingRow {
  id: string;
  status: string;
  budget: string | null;
  term_days: number | null;
  contract_amount: string | null;
  inspection_manager: string | null;
  deadline_at: Date | null;
}

interface ChangeEvent {
  field: string;
  before: string | number | null;
  after: string | number | null;
}

function toNum(v: string | number | null): number | null {
  if (v === null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toMillis(v: Date | string | null): number | null {
  if (v === null) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

function toIso(v: Date | string | null): string | null {
  if (v === null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

/** 덮어쓰기 전에 무엇이 어떻게 바뀌었는지 뽑아낸다 (§5 — 이게 유실되면 목표2가 무너짐) */
function diffProject(before: ExistingRow, after: MappedProject): ChangeEvent[] {
  const changes: ChangeEvent[] = [];

  if (before.status !== after.status) {
    changes.push({ field: "status", before: before.status, after: after.status });
  }
  if (toNum(before.budget) !== after.budget) {
    changes.push({ field: "budget", before: toNum(before.budget), after: after.budget });
  }
  if (toNum(before.term_days) !== after.term_days) {
    changes.push({ field: "term_days", before: toNum(before.term_days), after: after.term_days });
  }
  if (toNum(before.contract_amount) !== after.contract_amount) {
    changes.push({
      field: "contract_amount",
      before: toNum(before.contract_amount),
      after: after.contract_amount,
    });
  }
  if ((before.inspection_manager ?? null) !== after.inspection_manager) {
    changes.push({
      field: "manager",
      before: before.inspection_manager,
      after: after.inspection_manager,
    });
  }
  if (toMillis(before.deadline_at) !== toMillis(after.deadline_at)) {
    changes.push({
      field: "deadline",
      before: toIso(before.deadline_at),
      after: after.deadline_at,
    });
  }

  return changes;
}

/**
 * POST /api/sync/projects
 * body: { rows: RawProject[] }  — 본진 date_modified ASC, id ASC 순
 *
 * upsert + 변경 감지(diff) → timeline_events 자동 생성. 커서는 전 과정 성공 후에만 전진.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireSyncKey(req);
  if (denied) return denied;

  let body: { rows?: RawProject[] };
  try {
    body = (await req.json()) as { rows?: RawProject[] };
  } catch {
    return Response.json({ error: "JSON 파싱 실패" }, { status: 400 });
  }

  const rows = body.rows;
  if (!Array.isArray(rows)) {
    return Response.json({ error: "rows 배열이 필요합니다." }, { status: 400 });
  }
  if (rows.length > MAX_BATCH) {
    return Response.json(
      { error: `배치는 최대 ${MAX_BATCH}건입니다. (받은 건수: ${rows.length})` },
      { status: 400 },
    );
  }
  if (rows.length === 0) {
    return Response.json({
      upserted: 0,
      skipped: 0,
      events: 0,
      cursor: await readCursor("projects"),
    });
  }

  // 같은 id가 배치에 두 번 오면 ON CONFLICT DO UPDATE가 터진다 → 마지막 것만 남긴다
  const byId = new Map<string, MappedProject>();
  let skipped = 0;
  for (const raw of rows) {
    const mapped = mapProject(raw);
    if (!mapped) {
      skipped++; // 등록 전 단계(open/saved/frozen) — 동기화 대상 아님
      continue;
    }
    byId.set(mapped.id, mapped);
  }
  const mappedRows = [...byId.values()];

  // 커서 전진분 — 스킵된 행도 포함해 배치에서 가장 큰 (date_modified, id).
  // n8n이 ASC로 보내지만, 순서가 흔들려도 행을 놓치지 않도록 최댓값을 직접 구한다.
  const last = maxByCursor(rows, (r) => r.date_modified, (r) => r.id);
  const cursor = formatCursor(last.date_modified, last.id);

  // upsert·diff 이벤트·커서는 반드시 한 트랜잭션이어야 한다.
  // 나눠 커밋하면 upsert만 성공하고 이벤트 저장이 실패했을 때, 재전송이 와도
  // 기존 행이 이미 새 값이라 diff가 잡히지 않아 변경 이력이 영구 유실된다.
  const stmts: { text: string; params?: unknown[] }[] = [];
  let events = 0;
  // 계약 체결(상태 → '계약') 전이 — 트랜잭션 커밋 후에만 Slack 알림을 보낸다 (§ 계약 체결 노티)
  const contractNotices: { id: string; title: string; manager: string | null }[] = [];

  if (mappedRows.length > 0) {
    // 덮어쓰기 전 기존 값 확보 (읽기 전용 — 트랜잭션 밖)
    const ids = mappedRows.map((m) => m.id);
    const existing = await query<ExistingRow>(
      `SELECT id, status, budget, term_days, contract_amount, inspection_manager, deadline_at
         FROM projects WHERE id = ANY($1::bigint[])`,
      [ids],
    );
    const prev = new Map(existing.map((e) => [String(e.id), e]));

    // upsert (content_hash가 바뀌면 임베딩 무효화 → 재임베딩 대상이 됨)
    const updates = COLS.filter((c) => c !== "id")
      .map((c) => `${c} = EXCLUDED.${c}`)
      .join(", ");
    const reembed = "projects.content_hash IS DISTINCT FROM EXCLUDED.content_hash";
    const params = mappedRows.flatMap((m) => COLS.map((c) => m[c]));

    stmts.push({
      text: `INSERT INTO projects (${COLS.join(", ")})
       VALUES ${valuesClause(mappedRows.length, COLS.length)}
       ON CONFLICT (id) DO UPDATE SET
         ${updates},
         synced_at = now(),
         embedding       = CASE WHEN ${reembed} THEN NULL ELSE projects.embedding END,
         embedded_at     = CASE WHEN ${reembed} THEN NULL ELSE projects.embedded_at END,
         embedding_model = CASE WHEN ${reembed} THEN NULL ELSE projects.embedding_model END`,
      params,
    });

    // 변경 이벤트 생성 (기존 행이 있던 것만 — 신규 등록은 변경이 아님)
    const eventRows: unknown[][] = [];
    for (const m of mappedRows) {
      const before = prev.get(m.id);
      if (!before) continue;
      for (const c of diffProject(before, m)) {
        eventRows.push([
          m.id,
          c.field === "status" ? "status" : "change",
          `${m.id}:${c.field}:${m.source_modified_at}`, // 멱등성
          m.source_modified_at,
          m.status,
          CHANGE_LABEL[c.field] ?? c.field,
          c.field === "status" ? `${c.before} → ${c.after}` : null,
          JSON.stringify({ field: c.field, before: c.before, after: c.after }),
        ]);
        if (c.field === "status" && c.after === "계약") {
          contractNotices.push({ id: m.id, title: m.title, manager: m.inspection_manager });
        }
      }
    }

    if (eventRows.length > 0) {
      stmts.push({
        text: `INSERT INTO timeline_events (project_id, source, source_id, event_at, stage, title, body, meta)
         VALUES ${valuesClause(eventRows.length, 8)}
         ON CONFLICT (source, source_id) DO NOTHING`,
        params: eventRows.flat(),
      });
      events = eventRows.length;
    }
  }

  stmts.push({ text: SAVE_CURSOR_SQL, params: ["projects", cursor] });
  await transaction(stmts);

  // 커밋 성공 후에만 알림 — 실패한 동기화를 계약 체결로 잘못 알리지 않는다
  await Promise.all(
    contractNotices.map((n) =>
      notifySlack(
        `*계약 체결* — ${projectHyperlink(n.id, n.title)}${n.manager ? ` (담당 ${managerSlackTag(n.manager)})` : ""}`,
      ),
    ),
  );

  return Response.json({ upserted: mappedRows.length, skipped, events, cursor });
}
