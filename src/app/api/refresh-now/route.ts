// Settings의 "지금 갱신" 버튼 — cron(하루 3회)을 기다리지 않고 수동으로 즉시 실행.
// 라우트별 인증은 없다 — src/proxy.ts의 전역 게이트가 로그인한 사용자만 통과시킨다.
// 멱등·읽기전용 대상 선정(IS NULL/변화감지)이라 반복 호출해도 안전하다.

import { runRefresh } from "@/lib/refresh";

export const maxDuration = 60;

export async function POST(): Promise<Response> {
  const result = await runRefresh();
  return Response.json(result);
}
