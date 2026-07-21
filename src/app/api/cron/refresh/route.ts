// Vercel Cron (하루 3회: 09:30·13:00·17:00 KST) — 신규 유입분 자동 파생 생성.
// 실제 로직은 src/lib/refresh.ts에 있다 — Settings의 수동 "지금 갱신" 버튼(/api/refresh-now)과 공유.

import { runRefresh } from "@/lib/refresh";

export const maxDuration = 60;
// 라우트 핸들러가 정적으로 캐시되면 Vercel Cron의 자동 호출이 옛 캐시 응답만 받고 실제로
// 재실행되지 않는 사례가 보고돼 있다(대시보드 수동 Run은 되는데 스케줄 자동 실행만 안 되는 증상과 일치).
// 매번 새로 실행되도록 강제한다.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  // Vercel Cron은 CRON_SECRET이 설정돼 있으면 Authorization: Bearer <CRON_SECRET>를 자동으로 붙인다.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runRefresh();
  return Response.json(result);
}
