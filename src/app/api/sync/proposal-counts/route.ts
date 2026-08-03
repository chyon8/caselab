import { query } from "@/lib/db";
import { MAX_BATCH, requireSyncKey } from "@/lib/sync/auth";

/**
 * POST /api/sync/proposal-counts
 * body: { rows: [{ id, proposal_count }] }  — 모집중 프로젝트 전량 (커서 없음)
 *
 * 모집중 프로젝트의 지원수만 덮어쓴다.
 *
 * ⚠️ 왜 /api/sync/projects 로 못 하는가 — 본진 `project_project.date_modified` 는
 *    지원이 들어와도 갱신되지 않는다. date_modified 커서 기반인 projects 워크플로는
 *    그 행을 다시 조회하지 않으므로 proposal_count 가 마지막 동기화 시점 값에 고정된다.
 *    (2026-07-29 실측: 모집 마감 전 65건 중 36건이 모집 전환 시점 값 그대로였고
 *     그중 16건이 화면에 "지원 0건"으로 표시. 반대로 상태 전환 등으로 date_modified 가
 *     갱신된 건은 정확 — 계약·진행·완료 1,845건에는 0건이 하나도 없다.)
 *
 * ⚠️ 커서(sync_state)를 건드리지 않는다. 여기서 재조회하는 행의 date_modified 는 현재
 *    커서보다 과거이므로, 커서를 저장하면 projects 증분 동기화가 뒤로 밀려 같은 구간을
 *    반복 처리한다.
 */
interface RawRow {
  id: number | string;
  proposal_count: number | string | null;
}

export async function POST(req: Request): Promise<Response> {
  const denied = requireSyncKey(req);
  if (denied) return denied;

  let body: { rows?: RawRow[] };
  try {
    body = (await req.json()) as { rows?: RawRow[] };
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

  // 같은 id 가 두 번 오면 마지막 것만 — unnest 조인이 같은 행을 중복 갱신하지 않도록
  const byId = new Map<string, number>();
  for (const r of rows) {
    const raw = r.proposal_count;
    // ⚠️ Number(null) 과 Number("") 는 NaN 이 아니라 0 이다. isFinite 로만 거르면
    //    본진이 NULL 을 준 행의 기존 지원수가 0 으로 덮여 사라진다 (실제로 밟은 버그).
    if (raw === null || raw === undefined || raw === "") continue;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) continue;
    byId.set(String(r.id), n);
  }
  if (byId.size === 0) {
    return Response.json({ received: rows.length, updated: 0 });
  }

  // 이미 있는 행만 UPDATE 한다. INSERT 하지 않는다 — 이 라우트는 id·지원수 두 컬럼만
  // 받으므로 새 행을 만들면 반쪽짜리 프로젝트가 생긴다. 아직 CaseLab 에 없는 프로젝트는
  // projects 워크플로가 온전히 적재한다.
  // content_hash 를 안 건드리므로 임베딩도 무효화되지 않는다.
  const updated = await query<{ id: string }>(
    `UPDATE projects p
        SET proposal_count = v.cnt
       FROM unnest($1::bigint[], $2::int[]) AS v(id, cnt)
      WHERE p.id = v.id
        AND p.proposal_count IS DISTINCT FROM v.cnt
      RETURNING p.id`,
    [[...byId.keys()], [...byId.values()]],
  );

  return Response.json({ received: rows.length, updated: updated.length });
}
