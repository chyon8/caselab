/**
 * 본진 auth_user 계정명 → 매니저 실명.
 *
 * 본진의 auth_user에 이름 필드가 비어 있어 계정명(manager_sangmin)으로 내려온다.
 * DB에는 계정명 그대로 저장하고 화면에 그릴 때만 실명으로 바꾼다 —
 * 팀에 변동이 생기면 재동기화 없이 이 표만 고치면 된다.
 *
 * 표에 없는 계정명은 그대로 노출된다 (임의로 추측해서 잘못된 이름을 붙이지 않는다).
 */
export const MANAGER_NAMES: Record<string, string> = {
  manager_sangmin: "이상민",
  manager_suyong: "장수룡",
  manager_semin: "김세민", // ⚠️ 계정명 미확인 — 다른 계정의 명명 규칙에서 추정. 실데이터로 확인 필요
  manager_jinsol: "서진솔",
  manager_eunsik: "김은식",
  manager_dongmin: "우동민",
};

/** 필터 드롭다운에 개별 항목으로 노출할 매니저. 나머지는 "그 외"로 묶는다. */
export const PRIMARY_MANAGERS = ["이상민", "장수룡", "김세민"];

export const OTHER_MANAGERS = "그 외";

export function managerName(username: string | null): string {
  if (!username) return "";
  return MANAGER_NAMES[username] ?? username;
}

/** "그 외"는 주요 매니저 3인이 아닌 모든 담당자를 뜻한다 */
export function matchesManager(manager: string, filter: string): boolean {
  if (filter === "전체") return true;
  if (filter === OTHER_MANAGERS) return !PRIMARY_MANAGERS.includes(manager);
  return manager === filter;
}
