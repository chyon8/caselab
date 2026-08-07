// 검수 세션 한 건.
//   GET    /api/review-session/:id → { session }
//   DELETE /api/review-session/:id → { ok: true }
import { currentManagerEmail, deleteSession, getSession } from "@/lib/review-session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const email = await currentManagerEmail();
  if (!email) return Response.json({ error: "unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isFinite(id)) return Response.json({ error: "잘못된 id입니다." }, { status: 400 });

  try {
    const session = await getSession(email, id);
    if (!session) return Response.json({ error: "세션을 찾을 수 없습니다." }, { status: 404 });
    return Response.json({ session });
  } catch (e) {
    console.error("[/api/review-session/:id GET]", e);
    return Response.json({ error: "불러오지 못했습니다." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx): Promise<Response> {
  const email = await currentManagerEmail();
  if (!email) return Response.json({ error: "unauthorized" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isFinite(id)) return Response.json({ error: "잘못된 id입니다." }, { status: 400 });

  try {
    await deleteSession(email, id);
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[/api/review-session/:id DELETE]", e);
    return Response.json({ error: "삭제하지 못했습니다." }, { status: 500 });
  }
}
