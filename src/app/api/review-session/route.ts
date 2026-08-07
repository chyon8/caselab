// 검수 세션 저장/목록.
//   POST /api/review-session  { id?, title, sourceText, analysis, draft, calls } → { id }
//   GET  /api/review-session                                                     → { sessions }
import {
  currentManagerEmail,
  listSessions,
  saveSession,
  type SessionCall,
  type SessionInput,
} from "@/lib/review-session";

export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const email = await currentManagerEmail();
  if (!email) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: Partial<SessionInput>;
  try {
    body = (await req.json()) as Partial<SessionInput>;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const sourceText = (body.sourceText ?? "").trim();
  if (!sourceText) return Response.json({ error: "의뢰 원문이 비어 있습니다." }, { status: 400 });

  // id는 숫자로 들어오지만, 예전 화면이 문자열을 보내도 갱신이 조용히 INSERT로 새지 않게 받아둔다
  const rawId = Number(body.id);
  try {
    const id = await saveSession(email, {
      id: Number.isFinite(rawId) && rawId > 0 ? rawId : undefined,
      title: typeof body.title === "string" ? body.title.slice(0, 200) : null,
      sourceText,
      analysis: body.analysis ?? null,
      draft: body.draft ?? null,
      calls: Array.isArray(body.calls) ? (body.calls as SessionCall[]) : [],
    });
    return Response.json({ id });
  } catch (e) {
    console.error("[/api/review-session POST]", e);
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `저장 실패: ${detail}` }, { status: 500 });
  }
}

export async function GET(): Promise<Response> {
  const email = await currentManagerEmail();
  if (!email) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    return Response.json({ sessions: await listSessions(email) });
  } catch (e) {
    console.error("[/api/review-session GET]", e);
    return Response.json({ error: "목록을 불러오지 못했습니다." }, { status: 500 });
  }
}
