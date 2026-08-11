/**
 * CaseLab 접근 허용 계정.
 *
 * 권한을 주려면 아래 배열에 이메일 한 줄만 추가하고 커밋·푸시하면 된다(자동 배포).
 * 권한을 뺄 때는 그 줄을 지운다 — 다음 접속부터 막힌다(이미 로그인된 세션은 최대 30일 유지).
 * 대소문자·앞뒤 공백은 알아서 무시한다.
 */
export const ALLOWED_EMAILS = [
  "sangmin@wishket.com", // 이상민
  "suyong@wishket.com", // 장수룡
  "seemin@wishket.com", // 김세민
  "nayeon@wishket.com", // 김나연
];

/**
 * 리포트의 **매니저별 지표**를 볼 수 있는 계정.
 *
 * 사람이 평가 단위인 유일한 섹션이라 접근 범위를 따로 둔다.
 * 여기 없는 계정은 섹션이 안 보이는 정도가 아니라 **조회 자체를 하지 않는다** —
 * 숨기기만 하면 페이로드에는 실려서 개발자도구로 다 보인다.
 */
export const REPORT_MANAGER_EMAILS = [
  "sangmin@wishket.com", // 이상민
];

export function canSeeManagerStats(email: string | undefined | null): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return REPORT_MANAGER_EMAILS.some((allowed) => allowed.trim().toLowerCase() === e);
}
