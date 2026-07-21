import { query } from "@/lib/db";
import { MAX_BATCH, requireSyncKey } from "@/lib/sync/auth";
import { formatCursor, maxByCursor } from "@/lib/sync/cursor";
import { readCursor, saveCursor } from "@/lib/sync/sync-state";
import { scrubPii } from "@/lib/sync/pii";
import { valuesClause } from "@/lib/sync/sql";

/** 본진 원본 이벤트 (노트·미팅·계약·마일스톤·Q&A) */
interface RawTimelineEvent {
  project_id: number | string;
  /** 'managenote' | 'meeting' | 'contract' | 'milestone' | 'qna' — 'status'/'change'는 서버 생성 전용 */
  source: string;
  source_id: number | string;
  event_at: string;
  stage?: string | null;
  title?: string | null;
  body?: string | null;
  meta?: Record<string, unknown> | null;
}

/** 서버가 스스로 만드는 이벤트 — n8n이 이 source로 밀어넣지 못하게 막는다 */
const SERVER_ONLY = new Set(["status", "change"]);

/**
 * POST /api/sync/timeline
 * body: { rows: RawTimelineEvent[] } — 한 배치는 한 source로 통일 (커서가 source별이므로)
 *
 * 아직 동기화되지 않은 project_id의 이벤트는 skip으로 세어 반환하고 커서를 전진시키지 않는다.
 * → 다음 주기에 프로젝트가 먼저 적재된 뒤 다시 들어온다.
 */
export async function POST(req: Request): Promise<Response> {
  const denied = requireSyncKey(req);
  if (denied) return denied;

  let body: { rows?: RawTimelineEvent[] };
  try {
    body = (await req.json()) as { rows?: RawTimelineEvent[] };
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

  const sources = new Set(rows.map((r) => r.source));
  for (const s of sources) {
    if (SERVER_ONLY.has(s)) {
      return Response.json(
        { error: `source '${s}'는 서버가 변경 감지로 생성합니다. 전송할 수 없습니다.` },
        { status: 400 },
      );
    }
  }
  if (sources.size > 1) {
    return Response.json(
      { error: `한 배치는 한 source여야 합니다. (받은 source: ${[...sources].join(", ")})` },
      { status: 400 },
    );
  }

  const source = [...sources][0];
  if (rows.length === 0) {
    return Response.json({ upserted: 0, skipped: 0, cursor: null });
  }

  // FK — 아직 없는 프로젝트의 이벤트는 넣지 않는다
  const ids = [...new Set(rows.map((r) => String(r.project_id)))];
  const known = await query<{ id: string }>(
    "SELECT id FROM projects WHERE id = ANY($1::bigint[])",
    [ids],
  );
  const knownIds = new Set(known.map((k) => String(k.id)));

  const insertable = rows.filter((r) => knownIds.has(String(r.project_id)));
  const skipped = rows.length - insertable.length;

  if (insertable.length > 0) {
    const params = insertable.flatMap((r) => [
      String(r.project_id),
      r.source,
      String(r.source_id),
      r.event_at,
      r.stage ?? null,
      // 매니저 노트·미팅 메모에는 고객 연락처가 자주 박혀 있다 — 저장 전 스크럽
      scrubPii(r.title ?? null),
      scrubPii(r.body ?? null),
      r.meta ? JSON.stringify(r.meta) : null,
    ]);

    await query(
      `INSERT INTO timeline_events (project_id, source, source_id, event_at, stage, title, body, meta)
       VALUES ${valuesClause(insertable.length, 8)}
       ON CONFLICT (source, source_id) DO UPDATE SET
         event_at = EXCLUDED.event_at,
         stage    = EXCLUDED.stage,
         title    = EXCLUDED.title,
         body     = EXCLUDED.body,
         meta     = EXCLUDED.meta`,
      params,
    );
  }

  // skip이 있으면 커서를 세우지 않는다 — 다음 주기에 같은 구간을 다시 받아 재시도해야 하므로
  let cursor: string | null = await readCursor(source);
  if (skipped === 0) {
    const last = maxByCursor(rows, (r) => r.event_at, (r) => r.source_id);
    cursor = formatCursor(last.event_at, last.source_id);
    await saveCursor(source, cursor);
  }

  return Response.json({ upserted: insertable.length, skipped, cursor });
}
