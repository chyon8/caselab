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
  manager_semin: "김세민",
  manager_jinsol: "서진솔",
  manager_eunsik: "김은식",
  manager_dongmin: "우동민",
  manager_nayeon: "김나연",
  manager_jongyeon: "배종연",
};

/** 필터 드롭다운에 개별 항목으로 노출할 매니저. 나머지는 "그 외"로 묶는다. */
export const PRIMARY_MANAGERS = ["이상민", "장수룡", "김세민"];

export const OTHER_MANAGERS = "그 외";

export function managerName(username: string | null): string {
  if (!username) return "";
  return MANAGER_NAMES[username] ?? username;
}

/**
 * 본진 계정명 → Slack 멤버 ID. Slack 프로필 "더보기 → 멤버 ID 복사"로 확인.
 * 매핑 없는 매니저는 알림에 핑 없이 실명만 표시된다(알림 자체는 계속 감).
 */
export const MANAGER_SLACK_IDS: Record<string, string> = {
  manager_sangmin: "U07V76R1PLN",
  manager_semin: "U0B3X3HHB1C",
  manager_suyong: "U1FCQ09JQ",
};

/** Slack 메시지용 태그 — 매핑 있으면 <@ID>(멘션), 없으면 실명(멘션 없이 표시만) */
export function managerSlackTag(username: string | null): string {
  if (!username) return "";
  const slackId = MANAGER_SLACK_IDS[username];
  return slackId ? `<@${slackId}>` : managerName(username);
}

/** "그 외"는 주요 매니저 3인이 아닌 모든 담당자를 뜻한다 */
export function matchesManager(manager: string, filter: string): boolean {
  if (filter === "전체") return true;
  if (filter === OTHER_MANAGERS) return !PRIMARY_MANAGERS.includes(manager);
  return manager === filter;
}

/** 주요 매니저 3인의 본진 계정명 (DB에는 실명이 아니라 계정명이 저장돼 있다) */
export const PRIMARY_MANAGER_ACCOUNTS = Object.entries(MANAGER_NAMES)
  .filter(([, name]) => PRIMARY_MANAGERS.includes(name))
  .map(([account]) => account);

/** 매니저 필터를 서버 SQL 조건 재료로 변환 (matchesManager의 SQL판) */
export type ManagerFilterSql =
  | { kind: "all" }
  | { kind: "in"; accounts: string[] }
  | { kind: "other"; primaryAccounts: string[] };

export function managerFilterSql(filter: string): ManagerFilterSql {
  if (filter === "전체") return { kind: "all" };
  if (filter === OTHER_MANAGERS) {
    return { kind: "other", primaryAccounts: PRIMARY_MANAGER_ACCOUNTS };
  }
  // 실명 → 계정명. 같은 실명에 매핑되는 계정이 여럿일 수 있어 배열로.
  const accounts = Object.entries(MANAGER_NAMES)
    .filter(([, name]) => name === filter)
    .map(([account]) => account);
  return { kind: "in", accounts };
}
