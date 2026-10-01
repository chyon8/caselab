/**
 * 검수 거절 사유 분류 사전 (/report/non-recruitment).
 *
 * 원천은 submission_analysis_projects.reject_reason — 본진 최신 거절 메모의 **첫 줄**이다.
 * 매니저가 첫 줄에 정해진 문구를 적고 자유 서술은 그 뒤에 붙인다. 그래서 공백을 지운 첫 줄의
 * **앞부분 일치**로 분류한다(n8n SQL의 reject_invalid 판정과 같은 방식).
 * DB에는 첫 줄 원문만 두고 분류는 조회할 때 한다 — 사전을 고쳐도 다시 적재할 필요가 없다.
 *
 * 카테고리 이름은 사내 Tableau «부적합 사유»를 따르되 두 가지를 나눴다(2026-10-01):
 *  - «재연락 N»은 연락이 한 번 닿은 뒤 끊긴 건이라 «연락 안됨»(처음부터 안 닿음)과 따로 센다
 *  - «프로젝트 진행 취소»는 Tableau가 «프로젝트 연기»에 넣지만, 끝난 건이라 «프로젝트 취소»로 뗀다
 */

/** 위에서부터 먼저 맞는 것을 쓴다. 접두어는 공백 없이 소문자로 적는다 */
const CATEGORIES: { label: string; prefixes: string[] }[] = [
  // 유효 거절
  { label: "연락 안됨", prefixes: ["연락안됨", "연락안됌"] },
  { label: "재연락 후 두절", prefixes: ["재연락"] },
  { label: "프로젝트 연기", prefixes: ["프로젝트연기", "프로젝트보류"] },
  { label: "프로젝트 취소", prefixes: ["프로젝트진행취소", "프로젝트취소", "취소", "문자로취소"] },
  { label: "견적·단순 문의", prefixes: ["견적문의", "단순문의"] },
  { label: "단가 안 맞음", prefixes: ["단가"] },
  { label: "기획 구체화 필요", prefixes: ["기획및내용구체화"] },
  { label: "타 업체와 진행", prefixes: ["타업체"] },
  { label: "자체 제작", prefixes: ["자체제작", "자체진행"] },
  { label: "일정 안 맞음", prefixes: ["진행일정"] },
  { label: "내용 공개 불가", prefixes: ["내용공개불가"] },
  { label: "사행성", prefixes: ["사행성", "등록불가프로젝트(사행성)"] },
  { label: "기타(지정)", prefixes: ["기타"] },
  // 무효 거절 — n8n/submission_conversion_daily.sql의 reject_invalid 목록과 맞춘다
  { label: "중복 등록·어뷰징", prefixes: ["중복등록", "프로젝트중복등록", "어뷰징"] },
  { label: "실수", prefixes: ["실수"] },
  { label: "테스트", prefixes: ["test", "테스트"] },
  { label: "지원사업·발주 계약 전", prefixes: ["지원사업선정전", "발주처와계약"] },
  { label: "이용 불가 업무", prefixes: ["it업무가아님", "등록불가업무", "위시켓이용"] },
  { label: "약관 위배", prefixes: ["이용약관위배", "타깃서비스이용약관위배"] },
  { label: "대학교 과제", prefixes: ["대학교과제"] },
];

/** 정해진 문구 없이 서술로 시작하는 첫 줄 */
export const REASON_FREE_TEXT = "기타(서술)";
/** 거절 로그가 없는 거절 — 7~8월 원장도 전부 «기타(미지정)»이었다 */
export const REASON_MISSING = "미지정";

export function classifyRejectReason(reason: string | null): string {
  if (!reason) return REASON_MISSING;
  const key = reason.replace(/\s+/g, "").toLowerCase();
  const hit = CATEGORIES.find((c) => c.prefixes.some((p) => key.startsWith(p)));
  return hit ? hit.label : REASON_FREE_TEXT;
}

/**
 * 모집 전 고객 직접 취소의 본진 cancel_type. «etc» 뒤에는 고객이 쓴 자유 서술이 붙어 오므로
 * 첫 단어(코드)만 본다 — 서술은 화면에 싣지 않는다.
 */
const CANCEL_TYPES: Record<string, string> = {
  add_mistake: "실수로 등록",
  project_cancel: "프로젝트 취소",
  change_plan: "계획 변경",
  duplicate: "중복 등록",
  by_inhouse: "자체 진행",
  contract_other: "타 업체와 계약",
  etc: "기타",
};

export function classifyCancelType(raw: string | null): string {
  const code = (raw ?? "").trim().split(/\s/)[0];
  if (!code) return REASON_MISSING;
  return CANCEL_TYPES[code] ?? "기타";
}
