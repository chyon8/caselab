// POST /api/test-draft { text, calls } — 의뢰 원문 + 선택 통화 녹취로 공고문 초안(테스트). 저장 안 함.
import { draftPosting, type DraftCall } from "@/lib/draft";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let text: string;
  let calls: DraftCall[];
  try {
    const body = (await req.json()) as { text?: string; calls?: DraftCall[] };
    text = (body.text ?? "").trim();
    calls = Array.isArray(body.calls) ? body.calls : [];
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (text.length < 3) {
    return Response.json({ error: "의뢰 원문을 입력해주세요." }, { status: 400 });
  }
  try {
    const result = await draftPosting(text, calls);
    return Response.json(result);
  } catch (e) {
    console.error("[/api/test-draft]", e);
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `공고문 draft 생성 실패: ${detail}` }, { status: 500 });
  }
}
