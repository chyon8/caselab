import { dataSource } from "@/data/source";
import { embedText } from "@/lib/embed";
import { normalizePosting } from "@/lib/normalize";

/**
 * POST /api/similar { text } — 공고문 붙여넣기 유사사례 검색(L2).
 * 정리 안 된 원본 의뢰 내용 → 표준 공고 형식으로 정규화 → 즉석 임베딩 → pgvector 유사도 검색.
 * 응답: { normalized(정규화 텍스트), results(유사 프로젝트 상위 N건), stats(유사사례 집계 통계) }.
 */
export async function POST(req: Request): Promise<Response> {
  let text: string;
  try {
    const body = (await req.json()) as { text?: string };
    text = (body.text ?? "").trim();
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (text.length < 3) {
    return Response.json({ error: "검색할 내용을 입력해주세요." }, { status: 400 });
  }

  try {
    const normalized = await normalizePosting(text);
    const vector = await embedText(normalized);
    const [results, stats] = await Promise.all([
      dataSource.searchSimilarByVector(vector, 8),
      dataSource.searchSimilarStats(vector),
    ]);
    return Response.json({ normalized, results, stats });
  } catch (e) {
    console.error("[/api/similar]", e);
    return Response.json({ error: "검색 중 문제가 발생했습니다." }, { status: 500 });
  }
}
