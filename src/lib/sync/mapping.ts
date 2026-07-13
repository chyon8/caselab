import { createHash } from "node:crypto";
import { scrubPii } from "./pii";
import type { ProjectStatus } from "@/data/types";

/**
 * n8n이 본진(위시켓) DB에서 조회해 전송하는 원본 행.
 * (DATA_INTEGRATION.md §5 증분 조회 SQL + 조인 필드)
 *
 * 날짜는 모두 UTC ISO-8601 문자열로 보낸다. 커서가 본진 MySQL로 되돌아가
 * `date_modified > :ts` 비교에 그대로 쓰이므로 타임존이 흔들리면 행을 놓친다.
 */
export interface RawProject {
  id: number | string;
  title: string;
  description: string | null;
  budget: number | string | null;
  term: number | null;
  term_type: string | null;
  status: string;
  is_cancelled: number | boolean | null;
  is_rejected: number | boolean | null;
  date_modified: string;
  date_start_recruitment: string | null;
  date_cancelled: string | null;
  date_rejected: string | null;
  date_deleted: string | null;
  date_deadline: string | null;
  management_hide: number | boolean | null;
  skills_slug: string | null;
  initial_budget: number | string | null;
  initial_term: number | null;
  initial_term_type: string | null;

  /** 아래는 조인으로 채워지는 값 (n8n 워크플로 상세 명세 — §5) */
  client_name?: string | null;
  category?: string | null;
  inspection_manager?: string | null;
  manager_ids?: (number | string)[] | null;
  /** 유효 계약 = agreement(hide=0, date_deleted IS NULL) + 체결된 sub_contract 존재 (§2) */
  has_valid_agreement?: number | boolean | null;
  agreement_price?: number | string | null;
  agreement_date_start_progress?: string | null;
  agreement_date_completed?: string | null;
  contract_term_days?: number | null;
  cancel_reason?: string | null;
}

/** CaseLab projects 테이블에 적재되는 형태 */
export interface MappedProject {
  id: string;
  title: string;
  client_name: string | null;
  category: string | null;
  tech: string | null;
  budget: number | null;
  term_days: number | null;
  initial_budget: number | null;
  initial_term_days: number | null;
  status: ProjectStatus;
  stage: number;
  inspection_manager: string | null;
  manager_ids: string | null;
  contract_amount: number | null;
  contract_term_days: number | null;
  deadline_at: string | null;
  cancel_stage: string | null;
  cancel_reason: string | null;
  posting_raw: string | null;
  content_hash: string;
  deleted_at: string | null;
  hidden: boolean;
  source_modified_at: string;
}

/** MySQL은 boolean을 0/1로 준다 */
function truthy(v: number | boolean | null | undefined): boolean {
  return v === 1 || v === true;
}

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** term + term_type → 일 단위 (DATA_SCHEMA §1: term_type은 'month' | 'day') */
export function toTermDays(
  term: number | null,
  termType: string | null,
): number | null {
  if (term === null || term === undefined) return null;
  return termType === "month" ? term * 30 : term;
}

/**
 * §2 상태 매핑. 판정 순서대로 적용한다 — status만 보면 안 된다.
 * 동기화 대상이 아니면(등록 전 단계, 미지의 status) null.
 */
export function mapStatus(
  r: RawProject,
): { status: ProjectStatus; stage: number } | null {
  const validAgreement = truthy(r.has_valid_agreement);

  if (
    truthy(r.is_cancelled) ||
    truthy(r.is_rejected) ||
    r.date_cancelled ||
    r.date_rejected
  ) {
    return { status: "완료(취소)", stage: 5 };
  }
  if (
    r.status === "completed" ||
    (validAgreement && r.agreement_date_completed)
  ) {
    return { status: "완료(성공)", stage: 5 };
  }
  if (
    validAgreement &&
    r.agreement_date_start_progress &&
    !r.agreement_date_completed
  ) {
    return { status: "진행", stage: 4 };
  }
  if (r.status === "contracted" || validAgreement) {
    return { status: "계약", stage: 3 };
  }
  if (r.status === "recruiting" || r.status === "close_recruiting") {
    return { status: "모집", stage: 2 };
  }
  if (r.status === "submitted") {
    return { status: "검수", stage: 1 };
  }
  // 'open' | 'saved' | 'frozen' (등록 전 단계) 및 미지의 status → 동기화 제외
  return null;
}

/** 취소 시점에 마지막으로 도달했던 단계를 역산 (§2) */
function cancelStage(r: RawProject): string {
  if (truthy(r.has_valid_agreement)) return "계약";
  return r.date_start_recruitment ? "모집" : "검수";
}

/** 임베딩 대상 텍스트의 해시 — 이 값이 바뀐 프로젝트만 재임베딩한다 (§5) */
function contentHash(title: string, description: string | null, r: RawProject): string {
  const text = [title, description ?? "", r.category ?? "", r.skills_slug ?? ""].join("\n");
  return createHash("sha256").update(text).digest("hex");
}

/** 원본 행 → CaseLab 적재 형태. 동기화 대상이 아니면 null. */
export function mapProject(r: RawProject): MappedProject | null {
  const mapped = mapStatus(r);
  if (!mapped) return null;

  const cancelled = mapped.status === "완료(취소)";

  // 자유 텍스트는 저장 전 연락처 스크럽 — 해시·임베딩도 스크럽된 텍스트 기준
  const title = scrubPii(r.title);
  const description = scrubPii(r.description);

  return {
    id: String(r.id),
    title,
    client_name: r.client_name ?? null,
    category: r.category ?? null,
    tech: r.skills_slug,
    budget: num(r.budget),
    term_days: toTermDays(r.term, r.term_type),
    initial_budget: num(r.initial_budget),
    initial_term_days: toTermDays(r.initial_term, r.initial_term_type),
    status: mapped.status,
    stage: mapped.stage,
    inspection_manager: r.inspection_manager ?? null,
    manager_ids: r.manager_ids ? JSON.stringify(r.manager_ids.map(String)) : null,
    contract_amount: num(r.agreement_price),
    contract_term_days: r.contract_term_days ?? null,
    deadline_at: r.date_deadline,
    cancel_stage: cancelled ? cancelStage(r) : null,
    cancel_reason: cancelled ? scrubPii(r.cancel_reason ?? null) : null,
    posting_raw: description,
    content_hash: contentHash(title, description, r),
    deleted_at: r.date_deleted,
    hidden: truthy(r.management_hide),
    source_modified_at: r.date_modified,
  };
}
