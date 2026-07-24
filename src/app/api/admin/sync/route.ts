import { query } from "@/lib/db";

/**
 * GET /api/admin/sync — 마지막으로 동기화가 완료·보고된 시각.
 * sync_state.last_run_at 의 최댓값(어느 파이프라인이든 가장 최근에 커서를 저장한 시각).
 * 버튼은 n8n 을 트리거만 하고 실제 싱크는 백그라운드라, 누른 직후엔 이 값이 아직 안 바뀔 수 있다.
 */
export async function GET(): Promise<Response> {
  if (!process.env.DATABASE_URL) return Response.json({ lastRunAt: null });
  const rows = await query<{ last_run_at: string | null }>(
    "SELECT MAX(last_run_at) AS last_run_at FROM sync_state",
  );
  return Response.json({ lastRunAt: rows[0]?.last_run_at ?? null });
}
