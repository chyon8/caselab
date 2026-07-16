import { query } from "@/lib/db";
import { MAX_BATCH, requireSyncKey } from "@/lib/sync/auth";
import { formatCursor, maxByCursor } from "@/lib/sync/cursor";
import { readCursor, saveCursor } from "@/lib/sync/sync-state";
import { scrubPii } from "@/lib/sync/pii";
import { valuesClause } from "@/lib/sync/sql";

/**
 * 개발사 사전 미팅 녹취 (2026-07-15). 통화 녹취(calls, by-phone)와 별개 데이터다.
 * /api/meetings/ 가 project_id 로 매칭해 전문을 주므로 confidence 추측·전화번호 hop 이 없다.
 * member_name(매니저명)은 n8n 에서 제외하고 온다. summary·transcript 는 저장 전 scrubPii.
 *
 * 커서 source 는 'meeting_transcripts' — 타임라인 미팅 sync('meeting')와 충돌하지 않게 분리.
 */
interface RawMeeting {
  id: number | string;
  project_id: number | string;
  partner_slug?: string | null;
  summary?: string | null;
  transcript?: string | null;
  match_reason?: string | null;
  created_at: string;
}

const CURSOR = "meeting_transcripts";

/** POST /api/sync/meetings — body: { rows: RawMeeting[] } */
export async function POST(req: Request): Promise<Response> {
  const denied = requireSyncKey(req);
  if (denied) return denied;

  let body: { rows?: RawMeeting[]; cursor?: string };
  try {
    body = (await req.json()) as { rows?: RawMeeting[]; cursor?: string };
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
    // 녹취 없는 미팅(total:0)만 있던 배치 — 적재할 건 없어도 스캔 워터마크는 전진시켜야
    // 다음 배치로 넘어간다. body.cursor 가 없으면(구 파이프라인) 종전대로 전진하지 않는다.
    if (body.cursor) await saveCursor(CURSOR, body.cursor);
    return Response.json({
      upserted: 0,
      skipped: 0,
      cursor: body.cursor ?? (await readCursor(CURSOR)),
    });
  }

  const ids = [...new Set(rows.map((r) => r.project_id).filter((id) => id != null).map(String))];
  const known = await query<{ id: string }>(
    "SELECT id FROM projects WHERE id = ANY($1::bigint[])",
    [ids],
  );
  const knownIds = new Set(known.map((k) => String(k.id)));

  // 미적재 프로젝트(knownIds 밖)의 미팅은 버린다 — 다음 주기에 프로젝트가 먼저 적재된 뒤 재시도.
  // 같은 id 가 배치에 두 번 오면 ON CONFLICT DO UPDATE 가 터진다 → 마지막 것만 남긴다.
  const byId = new Map<string, RawMeeting>();
  for (const r of rows) {
    if (knownIds.has(String(r.project_id))) byId.set(String(r.id), r);
  }
  const insertable = [...byId.values()];
  const skipped = rows.length - insertable.length;

  if (insertable.length > 0) {
    const params = insertable.flatMap((r) => [
      String(r.id),
      String(r.project_id),
      r.partner_slug ?? null,
      // 요약·전문·매칭근거에 "010-…로 연락 요청" 류가 섞일 수 있다 — 저장 전 스크럽 (이름은 못 잡음)
      scrubPii(r.summary ?? null),
      scrubPii(r.transcript ?? null),
      scrubPii(r.match_reason ?? null),
      r.created_at,
    ]);

    await query(
      `INSERT INTO meetings (id, project_id, partner_slug, summary, transcript, match_reason, created_at)
       VALUES ${valuesClause(insertable.length, 7)}
       ON CONFLICT (id) DO UPDATE SET
         project_id   = EXCLUDED.project_id,
         partner_slug = EXCLUDED.partner_slug,
         summary      = EXCLUDED.summary,
         transcript   = EXCLUDED.transcript,
         match_reason = EXCLUDED.match_reason,
         created_at   = EXCLUDED.created_at`,
      params,
    );
  }

  // 프로젝트 미적재로 skip된 미팅이 있으면 커서를 세우지 않는다 (다음 주기 재시도)
  let cursor: string | null = await readCursor(CURSOR);
  if (skipped === 0) {
    // n8n이 본진 meeting_meeting.date_created 워터마크를 body.cursor로 실어 보내면 그걸 쓴다.
    // (row.created_at 은 미팅일이라 커서 축이 다르다 — meetings_pipeline.md ① 참고)
    if (body.cursor) {
      cursor = body.cursor;
    } else {
      const last = maxByCursor(rows, (r) => r.created_at, (r) => r.id);
      cursor = formatCursor(last.created_at, last.id);
    }
    await saveCursor(CURSOR, cursor);
  }

  return Response.json({ upserted: insertable.length, skipped, cursor });
}
