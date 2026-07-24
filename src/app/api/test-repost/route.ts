// POST /api/test-repost { text } — 러프 인풋을 공고문 양식으로 재배치(워딩 불변, 테스트). 저장 안 함.
import { repostInput } from "@/lib/repost";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  let text: string;
  try {
    const body = (await req.json()) as { text?: string };
    text = (body.text ?? "").trim();
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (text.length < 3) {
    return Response.json({ error: "재배치할 내용을 입력해주세요." }, { status: 400 });
  }
  try {
    const result = await repostInput(text);
    return Response.json(result);
  } catch (e) {
    console.error("[/api/test-repost]", e);
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `공고문 재배치 실패: ${detail}` }, { status: 500 });
  }
}
