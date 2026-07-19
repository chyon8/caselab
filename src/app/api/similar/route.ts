import { dataSource } from "@/data/source";
import { embedText } from "@/lib/embed";
import { normalizePosting } from "@/lib/normalize";

/**
 * POST /api/similar { text } — 공고문 붙여넣기 유사사례 검색(L2).
 * 정리 안 된 원본 의뢰 내용 → 표준 공고 형식으로 정규화 → 즉석 임베딩 → pgvector 유사도 검색.
 * 응답: { normalized, results(유사 상위 N건), stats(집계 통계) }.
 *
 * 검수 팁은 여기서 만들지 않는다 — LLM 호출이 하나 더 붙어 5초 넘게 걸리는데, 카드·통계는
 * 그전에 이미 준비돼 있어서 같이 묶으면 다 만들어질 때까지 화면이 빈 채로 기다린다.
 * 클라이언트가 이 응답의 normalized를 그대로 /api/review-tips에 넘겨 뒤이어 받아간다.
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
    const [results, stats] = await Promise.all([
      dataSource.searchSimilarByVector(vector, 8, scope),
      dataSource.searchSimilarStats(vector, scope),
    ]);
    return Response.json({ normalized, results, stats });
  } catch (e) {
    console.error("[/api/similar]", e);
    // 원인을 그대로 보여준다 — "검색 중 문제가 발생했습니다"만으로는 quota 초과인지
    // 키 문제인지 입력이 빈약한 건지 구분할 수 없어 사용자가 대응할 수 없다.
    const detail = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `검색 실패: ${detail}` }, { status: 500 });
  }
}
