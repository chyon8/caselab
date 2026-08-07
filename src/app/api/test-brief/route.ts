// POST /api/test-brief { text } — 러프 인풋을 훑기용 브리핑으로 압축(테스트). 저장 안 함.
import { briefInput } from "@/lib/brief";

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
    return Response.json({ error: "요약할 내용을 입력해주세요." }, { status: 400 });
  }
  try {
    const result = await briefInput(text);
    return Response.json(result);
  } catch (e) {
    console.error("[/api/test-brief]", e);
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `브리핑 생성 실패: ${detail}` }, { status: 500 });
  }
}
