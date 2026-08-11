import { setFavorite } from "@/lib/favorites";
import { currentManagerEmail } from "@/lib/review-session";

/**
 * POST /api/favorites — 관심 등록/해제. 본문 { projectId, on }.
 * 목록은 로그인 직후 레이아웃에서 한 번에 읽어 AppContext에 넣으므로 GET은 두지 않는다.
 */
export async function POST(req: Request): Promise<Response> {
  const email = await currentManagerEmail();
  if (!email) return new Response("unauthorized", { status: 401 });

  const body = (await req.json()) as { projectId?: string; on?: boolean };
  // project_id가 BIGINT라 숫자 id만 받는다(mock 데이터의 "p1" 같은 id는 거절)
  if (!body.projectId || !/^\d+$/.test(body.projectId)) {
    return new Response("bad request", { status: 400 });
  }

  await setFavorite(email, body.projectId, body.on === true);
  return Response.json({ ok: true });
}
