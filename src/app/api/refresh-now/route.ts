// Settings의 "지금 갱신" 버튼 — cron(하루 3회)을 기다리지 않고 수동으로 즉시 실행.
// CaseLab에 로그인 체계가 없어 별도 인증 없음 — 이 앱에 접근 가능한 사람이면 누구나 호출 가능.
// 멱등·읽기전용 대상 선정(IS NULL/변화감지)이라 반복 호출해도 안전하다.

import { runRefresh } from "@/lib/refresh";

export const maxDuration = 60;

export async function POST(): Promise<Response> {
  const result = await runRefresh();
  return Response.json(result);
}
