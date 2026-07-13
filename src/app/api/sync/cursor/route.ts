import { query } from "@/lib/db";
import { requireSyncKey } from "@/lib/sync/auth";
import { parseCursor } from "@/lib/sync/cursor";

/**
 * GET /api/sync/cursor?source=projects
 * n8n은 매 실행 시작 시 이걸 조회한다 (커서 이중 관리 금지 — §5).
 * 커서가 없으면 ts/id가 null → n8n은 초기 백필 구간부터 시작한다.
 */
export async function GET(req: Request): Promise<Response> {
  const denied = requireSyncKey(req);
  if (denied) return denied;

  const source = new URL(req.url).searchParams.get("source");
  if (!source) {
    return Response.json({ error: "source 쿼리 파라미터가 필요합니다." }, { status: 400 });
  }

  const rows = await query<{ cursor_value: string | null; last_run_at: string | null }>(
    "SELECT cursor_value, last_run_at FROM sync_state WHERE source = $1",
    [source],
  );

  const value = rows[0]?.cursor_value ?? null;
  const parsed = value ? parseCursor(value) : null;

  return Response.json({
    source,
    ts: parsed?.ts ?? null,
    id: parsed?.id ?? null,
    cursor: value,
    last_run_at: rows[0]?.last_run_at ?? null,
  });
}
