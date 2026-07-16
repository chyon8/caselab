import { dataSource } from "@/data/source";
import { DEFAULT_PAGE_SIZE } from "@/data/postgres";
import type { ProjectQuery } from "@/data/types";

/**
 * GET /api/projects — 목록/칸반 서버 조회 (필터·검색·페이지네이션).
 * 화면(ProjectList)이 필터·페이지가 바뀔 때마다 호출한다. 6천 건 통째 로드를 대체한다.
 *
 * 파라미터: q, status, manager, period(일수|"전체"), page, pageSize,
 *          starred(관심 id 콤마목록 — 관심필터 켜졌을 때만), mode=kanban.
 */
export async function GET(req: Request): Promise<Response> {
  const sp = new URL(req.url).searchParams;

  const period = sp.get("period");
  const starred = sp.get("starred");

  const params: ProjectQuery = {
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    manager: sp.get("manager") ?? undefined,
    periodDays: period == null || period === "전체" ? null : Number(period),
    // starred 파라미터가 있으면(빈 문자열 포함) 관심필터 켜진 것 — 빈 배열이면 결과 없음
    starredIds: starred == null ? undefined : starred.split(",").filter(Boolean),
    page: Number(sp.get("page") ?? "1"),
    pageSize: Number(sp.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)),
  };

  if (sp.get("mode") === "kanban") {
    return Response.json({ columns: await dataSource.getKanban(params) });
  }
  return Response.json(await dataSource.getProjects(params));
}
