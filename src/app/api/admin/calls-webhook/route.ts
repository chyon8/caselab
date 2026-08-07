// GET 핸들러가 process.env 만 읽고 요청 객체를 안 쓰면 Next.js가 정적으로 취급해 빌드 시점
// 값으로 캐싱한다 — 배포 후 env 변경이 반영 안 되는 원인. /api/admin/sync 와 같은 이유로 명시.
export const dynamic = "force-dynamic";

const NO_STORE = { headers: { "Cache-Control": "no-store" } };

/**
 * GET /api/admin/calls-webhook — "통화 녹취 불러오기"가 직접 칠 n8n 웹훅 URL.
 *
 * n8n 은 Cloudflare Access 뒤라 Vercel(서버)에서 치면 IP 기반으로 막혀 403 이다(/api/admin/sync 와 동일 이슈).
 * 그래서 여기서는 URL 만 내려주고, 브라우저가 그 URL 로 직접 통화 목록을 조회한다.
 * 이 URL 은 무인증 트리거용이라 클라이언트 노출돼도 무방하다.
 */
export async function GET(): Promise<Response> {
  const webhookUrl = process.env.N8N_CALLS_WEBHOOK_URL ?? null;
  return Response.json({ webhookUrl }, NO_STORE);
}
