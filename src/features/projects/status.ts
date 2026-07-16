import type { KanbanStatus } from "@/data/types";

/** 상태 → CSS 클래스 키. '미팅중'은 모집의 부분집합이라 같은 색(recruit)을 쓴다 — 컬럼명으로 구분한다 */
export const STATUS_KEY: Record<KanbanStatus, string> = {
  검수: "review",
  모집: "recruit",
  미팅중: "recruit",
  계약: "contract",
  진행: "progress",
  "완료(성공)": "success",
  "완료(취소)": "cancel",
};

export const KANBAN_STATUSES: KanbanStatus[] = [
  "검수",
  "모집",
  "미팅중",
  "계약",
  "진행",
  "완료(성공)",
  "완료(취소)",
];

export function statusLabel(s: KanbanStatus): string {
  if (s === "진행") return "프로젝트 진행";
  if (s === "계약") return "계약체결중";
  return s;
}
