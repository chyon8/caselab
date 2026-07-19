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
      dataSource.searchSimilarStats(vector, scope),
      dataSource.searchSimilarQnaPool(vector, undefined, scope),
    ]);
    // 검수 팁은 풀 내용을 gpt로 묶으므로 풀을 받은 뒤에 실행(순차)
    // 별도 try/catch: 검수 팁 생성 실패(quota 초과 등)가 결과·통계까지 함께 죽이면 안 된다
    let reviewTips = null;
    let reviewTipsError: string | undefined;
    try {
      reviewTips = await mergeReviewTips(pool, normalized);
    } catch (e) {
      console.error("[/api/similar] reviewTips", e);
      reviewTipsError = e instanceof Error ? e.message : "검수 팁 생성 중 문제가 발생했습니다.";
    }
    return Response.json({ normalized, results, stats, reviewTips, reviewTipsError });
  } catch (e) {
    console.error("[/api/similar]", e);
    // 원인을 그대로 보여준다 — "검색 중 문제가 발생했습니다"만으로는 quota 초과인지
    // 키 문제인지 입력이 빈약한 건지 구분할 수 없어 사용자가 대응할 수 없다.
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `검색 실패: ${detail}` }, { status: 500 });
  }
}
