import { dataSource } from "@/data/source";
import { embedText } from "@/lib/embed";
import { normalizePosting } from "@/lib/normalize";
import { mergeReviewTips } from "@/lib/review-tips";

/**
 * POST /api/similar { text } — 공고문 붙여넣기 유사사례 검색(L2).
 * 정리 안 된 원본 의뢰 내용 → 표준 공고 형식으로 정규화 → 즉석 임베딩 → pgvector 유사도 검색.
 * 응답: { normalized, results(유사 상위 N건), stats(집계 통계), reviewTips(풀 리스크·질문 통합) }.
 */
export async function POST(req: Request): Promise<Response> {
  let text: string;
  let scope: string | undefined;
  try {
    const body = (await req.json()) as { text?: string; scope?: string };
    text = (body.text ?? "").trim();
    // "전체"(또는 미지정)는 부스트 없음 — 순수 의미 검색
    scope = body.scope && body.scope !== "전체" ? body.scope : undefined;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (text.length < 3) {
    return Response.json({ error: "검색할 내용을 입력해주세요." }, { status: 400 });
  }

  try {
    const normalized = await normalizePosting(text);
    const vector = await embedText(normalized);
    const [results, stats, pool] = await Promise.all([
      dataSource.searchSimilarByVector(vector, 8, scope),
      dataSource.searchSimilarStats(vector),
      dataSource.searchSimilarQnaPool(vector),
    ]);
    // 검수 팁은 풀 내용을 gpt로 묶으므로 풀을 받은 뒤에 실행(순차)
    const reviewTips = await mergeReviewTips(pool);
    return Response.json({ normalized, results, stats, reviewTips });
  } catch (e) {
    console.error("[/api/similar]", e);
    return Response.json({ error: "검색 중 문제가 발생했습니다." }, { status: 500 });
  }
}
