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

/**
 * POST /api/admin/sync — n8n 동기화 워크플로를 수동 트리거한다.
 *
 * 브라우저가 n8n 웹훅 URL·인증키를 직접 갖지 않게, 서버(Vercel)에서 대신 웹훅을 친다.
 * n8n 웹훅은 "Respond Immediately"로 두는 걸 전제 — 트리거만 하고 파이프라인은
 * n8n 백그라운드에서 돈다. 그래서 이 라우트는 "실행 결과"가 아니라 "요청됐다"만 확인한다.
 *
 * 필요한 환경변수:
 *   N8N_SYNC_WEBHOOK_URL — n8n Webhook 노드의 Production URL (…/webhook/… , test 아님)
 *   N8N_SYNC_WEBHOOK_KEY — (선택) n8n Webhook 에 Header Auth 를 걸었을 때만. X-CaseLab-Key 헤더로 보낸다.
 *                          Auth None 이면 비워둔다 — 불필요한 헤더가 앞단 프록시에 막혀 403 날 수 있다.
 */
export async function POST(): Promise<Response> {
  const url = process.env.N8N_SYNC_WEBHOOK_URL;
  if (!url) {
    return Response.json(
      { error: "N8N_SYNC_WEBHOOK_URL이 서버에 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  // 웹훅 방향(CaseLab → n8n) 인증은 적재 방향(CASELAB_SYNC_KEY)과 별개다. 기본은 헤더 없이 보낸다.
  const key = process.env.N8N_SYNC_WEBHOOK_KEY;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: key ? { "X-CaseLab-Key": key } : {},
      signal: controller.signal,
    });
    if (!res.ok) {
      return Response.json(
        { error: `n8n 응답 ${res.status}` },
        { status: 502 },
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "n8n 응답 시간 초과" : "n8n 호출 실패";
    return Response.json({ error: msg }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
