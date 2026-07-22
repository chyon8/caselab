// POST /api/test-questions { text } — 범위 구체화·견적용 확인 질문 생성(테스트). 저장 안 함.
import { generateQuestions } from "@/lib/questions";

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
    return Response.json({ error: "질문을 만들 내용을 입력해주세요." }, { status: 400 });
  }
  try {
    const questions = await generateQuestions(text);
    return Response.json({ questions });
  } catch (e) {
    console.error("[/api/test-questions]", e);
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `질문 생성 실패: ${detail}` }, { status: 500 });
  }
}
