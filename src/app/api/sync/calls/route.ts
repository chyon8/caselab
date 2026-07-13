import { query } from "@/lib/db";
import { MAX_BATCH, requireSyncKey } from "@/lib/sync/auth";
import { formatCursor, maxByCursor } from "@/lib/sync/cursor";
import { readCursor, saveCursor } from "@/lib/sync/sync-state";
import { valuesClause } from "@/lib/sync/sql";

/**
 * 통화 요약 (§3).
 * 전화번호·녹취 원문(transcript)은 n8n 밖으로 나오지 않는다 — 여기서 받지도, 저장하지도 않는다.
 */
interface RawCall {
  id: number | string;
  project_id: number | string;
  call_type?: string | null;
  call_time_secs?: number | null;
  summary?: string | null;
  drive_url?: string | null;
  created_at: string;
}

/** POST /api/sync/calls — body: { rows: RawCall[] } */
export async function POST(req: Request): Promise<Response> {
  const denied = requireSyncKey(req);
  if (denied) return denied;

  let body: { rows?: RawCall[] };
  try {
    body = (await req.json()) as { rows?: RawCall[] };
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
    return Response.json({ upserted: 0, skipped: 0, cursor: await readCursor("calls") });
  }

  const ids = [...new Set(rows.map((r) => String(r.project_id)))];
  const known = await query<{ id: string }>(
    "SELECT id FROM projects WHERE id = ANY($1::bigint[])",
    [ids],
  );
  const knownIds = new Set(known.map((k) => String(k.id)));

  // 같은 id가 배치에 두 번 오면 ON CONFLICT DO UPDATE가 터진다 → 마지막 것만 남긴다
  const byId = new Map<string, RawCall>();
  for (const r of rows) {
    if (knownIds.has(String(r.project_id))) byId.set(String(r.id), r);
  }
  const insertable = [...byId.values()];
  const skipped = rows.length - insertable.length;

  if (insertable.length > 0) {
    const params = insertable.flatMap((r) => [
      String(r.id),
      String(r.project_id),
      r.call_type ?? null,
      r.call_time_secs ?? null,
      r.summary ?? null,
      r.drive_url ?? null,
      r.created_at,
    ]);

    await query(
      `INSERT INTO calls (id, project_id, call_type, call_time_secs, summary, drive_url, created_at)
       VALUES ${valuesClause(insertable.length, 7)}
       ON CONFLICT (id) DO UPDATE SET
         project_id     = EXCLUDED.project_id,
         call_type      = EXCLUDED.call_type,
         call_time_secs = EXCLUDED.call_time_secs,
         summary        = EXCLUDED.summary,
         drive_url      = EXCLUDED.drive_url,
         created_at     = EXCLUDED.created_at`,
      params,
    );
  }

  // 프로젝트 미적재로 skip된 통화가 있으면 커서를 세우지 않는다 (다음 주기 재시도)
  let cursor: string | null = await readCursor("calls");
  if (skipped === 0) {
    const last = maxByCursor(rows, (r) => r.created_at, (r) => r.id);
    cursor = formatCursor(last.created_at, last.id);
    await saveCursor("calls", cursor);
  }

  return Response.json({ upserted: insertable.length, skipped, cursor });
}
