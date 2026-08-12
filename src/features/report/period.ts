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

/**
 * 월별 계약률에 실을 최대 개월 수. 기간을 "전체"로 두면 막대가 끝없이 늘어난다.
 * 쿼리(postgres.ts)와 화면 문구(Report.tsx)가 같은 값을 봐야 해서 여기 둔다 —
 * 한쪽만 고치면 "최근 24개월"이라 써놓고 30개를 그리게 된다.
 */
export const REPORT_MONTHS = 24;

/**
 * 저지원 프로젝트 목록의 시작일. 통계(막대)는 기간 전체를 보지만, **실물 목록은 지금 손댈 수 있는
 * 것만** 본다 — 2024년 건을 넘겨보는 건 검수에 쓸모가 없다. 쿼리와 화면 문구가 같은 값을 봐야 한다.
 */
export const LOW_PROPOSAL_FROM = "2026-01-01";
/** 목록 한 페이지 건수 — 한 번에 쭉 내리지 않고 넘겨 본다 */
export const LOW_PROPOSAL_PAGE = 25;

/** URL 값 → 프리셋. 모르는 값은 "전체"로 떨어뜨린다 */
export function parsePeriod(value?: string): ReportPeriod {
  const hit = REPORT_PERIODS.find((p) => p.value === value);
  return hit ? hit.value : "전체";
}

export function periodDays(period: ReportPeriod): number | null {
  return REPORT_PERIODS.find((p) => p.value === period)?.days ?? null;
}
