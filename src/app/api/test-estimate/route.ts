// POST /api/test-estimate { text } — 러프 인풋 견적(테스트). prompt.md 단가표 기반, 산수는
// estimate-calc.ts가 결정적으로 계산(estimateInput 참고). 저장 안 함.
import { estimateInput } from "@/lib/estimate";

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
    return Response.json({ error: "견적낼 내용을 입력해주세요." }, { status: 400 });
  }
  try {
    const result = await estimateInput(text);
    return Response.json(result);
  } catch (e) {
    console.error("[/api/test-estimate]", e);
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `견적 실패: ${detail}` }, { status: 500 });
  }
}
