import { query } from "@/lib/db";

// GET 핸들러는 요청 객체를 안 쓰고 fetch 기반 DB 드라이버만 호출해서, 지정 안 하면
// Next.js가 정적으로 취급해 빌드 시점 응답을 캐싱한다 — last_run_at이 안 바뀐 것처럼 보이는 원인.
export const dynamic = "force-dynamic";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/**
 * GET /api/admin/sync — 마지막 동기화 시각 + n8n 웹훅 URL.
 *
 * n8n 은 Cloudflare Access 뒤라 Vercel(서버)에서 치면 IP 기반으로 막혀 403 이다. 그래서 트리거는
 * Access 에 신뢰된 "사용자 브라우저"가 직접 한다(→ SyncButton). 서버는 여기서 웹훅 URL 을 내려주고,
 * 브라우저가 그 URL 로 직접 POST 한다. 이 URL 은 무인증 트리거용이라 클라이언트 노출돼도 무방하다.
 */
export async function GET(): Promise<Response> {
  const webhookUrl = process.env.N8N_SYNC_WEBHOOK_URL ?? null;
  if (!process.env.DATABASE_URL) {
    return Response.json({ lastRunAt: null, webhookUrl }, NO_STORE);
  }
  const rows = await query<{ last_run_at: string | null }>(
    "SELECT MAX(last_run_at) AS last_run_at FROM sync_state",
  );
  return Response.json({ lastRunAt: rows[0]?.last_run_at ?? null, webhookUrl }, NO_STORE);
}
