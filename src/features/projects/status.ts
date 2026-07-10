import type { ProjectStatus } from "@/data/types";

/** 상태 → CSS 클래스 키 */
export const STATUS_KEY: Record<ProjectStatus, string> = {
  검수: "review",
  모집: "recruit",
  계약: "contract",
  진행: "progress",
  "완료(성공)": "success",
  "완료(취소)": "cancel",
};

export const KANBAN_STATUSES: ProjectStatus[] = [
  "검수",
  "모집",
  "계약",
  "진행",
  "완료(성공)",
  "완료(취소)",
];

export function statusLabel(s: ProjectStatus): string {
  return s === "진행" ? "프로젝트 진행" : s;
}
