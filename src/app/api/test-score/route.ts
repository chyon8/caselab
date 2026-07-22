// POST /api/test-score { text } — 러프 인풋 12섹션 스코어링(테스트). 저장 안 함.
import { scoreInput } from "@/lib/scoring";

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
    return Response.json({ error: "평가할 내용을 입력해주세요." }, { status: 400 });
  }
  try {
    const result = await scoreInput(text);
    return Response.json(result);
  } catch (e) {
    console.error("[/api/test-score]", e);
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `스코어링 실패: ${detail}` }, { status: 500 });
  }
}
