import { NextResponse } from "next/server";
import { dataSource } from "@/data/source";
import { parsePeriod, periodDays } from "@/features/report/period";

/**
 * 저지원 프로젝트 목록 한 페이지.
 *
 * 리포트 페이지를 통째로 다시 그리지 않으려고 뗀 라우트다 — 목록만 넘기는데 집계 12개를
 * 다시 돌리면 왕복이 길고, RSC 내비게이션이라 스크롤도 맨 위로 튄다.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("period") ?? undefined);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);

  const data = await dataSource.getLowProposalProjects(periodDays(period), page);
  return NextResponse.json(data);
}
