/**
 * 리포트 기간 프리셋.
 *
 * 기준 날짜는 **모집 전환일(recruit_started_at)** — 목록 필터(ProjectQuery.periodDays)와 같다.
 * 두 화면이 서로 다른 날짜를 기준으로 자르면 같은 구간인데 건수가 안 맞는다.
 *
 * value는 URL(?period=)에 그대로 실린다. days를 URL에서 받아 SQL에 넣지 않고
 * 이 표를 거쳐 화이트리스트로만 변환한다.
 */
export const REPORT_PERIODS = [
  { value: "전체", label: "기간 전체", days: null },
  { value: "1년", label: "최근 1년", days: 365 },
  { value: "6개월", label: "최근 6개월", days: 180 },
  { value: "3개월", label: "최근 3개월", days: 90 },
] as const;

export type ReportPeriod = (typeof REPORT_PERIODS)[number]["value"];

/** URL 값 → 프리셋. 모르는 값은 "전체"로 떨어뜨린다 */
export function parsePeriod(value?: string): ReportPeriod {
  const hit = REPORT_PERIODS.find((p) => p.value === value);
  return hit ? hit.value : "전체";
}

export function periodDays(period: ReportPeriod): number | null {
  return REPORT_PERIODS.find((p) => p.value === period)?.days ?? null;
}
