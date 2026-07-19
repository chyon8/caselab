import { dataSource } from "@/data/source";
import { embedText } from "@/lib/embed";
import { mergeReviewTips } from "@/lib/review-tips";

/**
 * POST /api/review-tips { normalized, scope } — 유사 풀의 Q&A 요약을 검수 팁으로 통합.
 *
 * /api/similar에서 떼어낸 후반부다. 카드·통계보다 5초 넘게 더 걸리는데 서로 의존하지 않아서,
 * 같이 묶으면 카드가 준비된 뒤에도 화면이 빈 채로 기다리게 된다. 클라이언트가 /api/similar의
 * normalized를 그대로 넘겨 이어서 호출한다.
 *
 * 벡터를 주고받는 대신 normalized로 다시 임베딩한다 — 1536개 실수를 요청 본문에 싣는 것보다
 * 재임베딩(0.6초, 1건당 $0.00002)이 싸고, 서버가 검색 상태를 들고 있지 않아도 된다.
 */
export async function POST(req: Request): Promise<Response> {
  let normalized: string;
  let scope: string | undefined;
  try {
    const body = (await req.json()) as { normalized?: string; scope?: string };
    normalized = (body.normalized ?? "").trim();
    // "전체"(또는 미지정)는 범위 필터 없음 — /api/similar과 같은 규칙
    scope = body.scope && body.scope !== "전체" ? body.scope : undefined;
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  if (normalized.length < 3) {
    return Response.json({ error: "검수 팁을 만들 내용이 없습니다." }, { status: 400 });
  }

  try {
    const vector = await embedText(normalized);
    const pool = await dataSource.searchSimilarQnaPool(vector, undefined, scope);
    const reviewTips = await mergeReviewTips(pool, normalized);
    return Response.json({ reviewTips });
  } catch (e) {
    console.error("[/api/review-tips]", e);
    // 원인을 그대로 보여준다 — quota 초과인지 키 문제인지 구분돼야 사용자가 대응할 수 있다.
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `검수 팁 생성 실패: ${detail}` }, { status: 500 });
  }
}
