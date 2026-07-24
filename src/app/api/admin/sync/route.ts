import { query } from "@/lib/db";

// GET 핸들러는 요청 객체를 안 쓰고 fetch 기반 DB 드라이버만 호출해서, 지정 안 하면
// Next.js가 정적으로 취급해 빌드 시점 응답을 캐싱한다 — Vercel에서 last_run_at이 영원히
// 안 바뀐 것처럼 보이는 원인이었다.
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/sync — 마지막으로 동기화가 완료·보고된 시각.
 * sync_state.last_run_at 의 최댓값(어느 파이프라인이든 가장 최근에 커서를 저장한 시각).
 * 버튼은 n8n 을 트리거만 하고 실제 싱크는 백그라운드라, 누른 직후엔 이 값이 아직 안 바뀔 수 있다.
 */
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

export async function GET(): Promise<Response> {
  if (!process.env.DATABASE_URL) return Response.json({ lastRunAt: null }, NO_STORE);
  const rows = await query<{ last_run_at: string | null }>(
    "SELECT MAX(last_run_at) AS last_run_at FROM sync_state",
  );
  return Response.json({ lastRunAt: rows[0]?.last_run_at ?? null }, NO_STORE);
}

/**
 * POST /api/admin/sync — n8n 동기화 워크플로를 수동 트리거한다.
 *
 * 브라우저가 n8n 웹훅 URL을 직접 갖지 않게, 서버(Vercel)에서 대신 웹훅을 친다.
 * n8n 웹훅은 "Respond Immediately"로 두는 걸 전제 — 트리거만 하고 파이프라인은
 * n8n 백그라운드에서 돈다. 그래서 이 라우트는 "실행 결과"가 아니라 "요청됐다"만 확인한다.
 *
 * 이 웹훅 경로(wishket-sync-trigger, 커스텀 path)는 n8n 이 걸려있는 Cloudflare Access 규칙과
 * 매칭되지 않아 인증 없이 통과된다(구 UUID path 는 Access 에 막혀 Vercel 502 의 원인이었음).
 *
 * 필요한 환경변수:
 *   N8N_SYNC_WEBHOOK_URL — n8n Webhook 노드의 Production URL (…/webhook/… , test 아님)
 */
export async function POST(): Promise<Response> {
  const url = process.env.N8N_SYNC_WEBHOOK_URL;
  if (!url) {
    return Response.json(
      { error: "N8N_SYNC_WEBHOOK_URL이 서버에 설정되지 않았습니다." },
      { status: 500 },
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(url, {
      method: "POST",
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return Response.json(
        { error: `n8n 응답 ${res.status}`, detail: body.slice(0, 300) },
        { status: 502 },
      );
    }
    return Response.json({ ok: true });
  } catch (e) {
    const isTimeout = e instanceof Error && e.name === "AbortError";
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: isTimeout ? "n8n 응답 시간 초과" : "n8n 호출 실패", detail },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
