import {
  REASON_FREE_TEXT,
  REASON_MISSING,
  classifyCancelType,
  classifyRejectReason,
} from "@/features/report/reject-reason-categories";
import type { Breakdown, NonRecruitmentStats, ReasonSegment } from "./types";

/** getNonRecruitmentStats가 받는 제출 1건 */
export interface NonRecruitmentRow {
  month: string;
  /** 전환율 화면의 유효 제출 조건(CONVERSION_VALID) */
  valid: boolean;
  recruited: boolean;
  rejected: boolean;
  cancelled: boolean;
  reject_invalid: boolean;
  reject_reason: string | null;
  raw_cancel_type: string | null;
  manager: string | null;
  field: string;
  business_form: string;
  acquisition: string;
  /** 이 제출 전에 위시켓에서 모집까지 간 프로젝트가 있었나 */
  history: string;
  /** 직군 조합 (개발+디자인 등) */
  job_types: string;
  attachment: string;
  initial_budget: number | string | null;
}

/** 세그먼트 표에 싣는 유효 거절 사유 수 — 나머지는 «거절률» 열에만 들어간다 */
const SEGMENT_COLUMNS = 6;

function pct(n: number, total: number): number {
  return total ? Math.round((n / total) * 1000) / 10 : 0;
}

function budgetBucket(value: number | string | null): string {
  const won = Number(value ?? 0);
  if (!Number.isFinite(won) || won <= 0) return "미입력";
  if (won < 5_000_000) return "500만 원 미만";
  if (won < 10_000_000) return "500만~1천만 원";
  if (won < 30_000_000) return "1천만~3천만 원";
  return "3천만 원 이상";
}
const BUDGET_ORDER = ["500만 원 미만", "500만~1천만 원", "1천만~3천만 원", "3천만 원 이상", "미입력"];

/** 라벨별 건수 → 구성비 막대. 많은 순, «기타(서술)»·«미지정»은 맨 뒤 */
function shareBreakdown(labels: string[]): Breakdown[] {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  const tail = (label: string) => (label === REASON_FREE_TEXT || label === REASON_MISSING ? 1 : 0);
  return [...counts]
    .sort((a, b) => tail(a[0]) - tail(b[0]) || b[1] - a[1])
    .map(([label, n]) => ({ label, decided: n, rate: pct(n, labels.length) }));
}

/**
 * 제출 행을 묶음(전환·유효 거절·무효 거절·직접 취소·대기)으로 나누고 사유를 붙여 화면 집계를 만든다.
 * 묶음 정의는 analysis/non-recruitment-reasons/PLAN.md §4.
 */
export function buildNonRecruitmentStats(
  rows: NonRecruitmentRow[],
  asOf: string | null,
  softSample: number,
): NonRecruitmentStats {
  const valid = rows.filter((r) => r.valid);
  const validRejected = valid.filter((r) => !r.recruited && r.rejected);
  const invalidRejected = rows.filter((r) => !r.recruited && r.rejected && r.reject_invalid);
  const cancelled = rows.filter((r) => !r.recruited && r.cancelled && !r.rejected);

  const reasonOf = new Map(validRejected.map((r) => [r, classifyRejectReason(r.reject_reason)]));
  const validReasons = shareBreakdown([...reasonOf.values()]);
  const columns = validReasons
    .map((b) => b.label)
    .filter((label) => label !== REASON_FREE_TEXT && label !== REASON_MISSING)
    .slice(0, SEGMENT_COLUMNS);

  const segment = (
    title: string,
    key: (r: NonRecruitmentRow) => string | null,
    opts: { note?: string; order?: string[]; minTotal?: number } = {},
  ): ReasonSegment => {
    const groups = new Map<string, NonRecruitmentRow[]>();
    for (const r of valid) {
      const label = key(r);
      if (label === null) continue;
      const members = groups.get(label);
      if (members) members.push(r);
      else groups.set(label, [r]);
    }
    const ordered = [...groups].sort((a, b) =>
      opts.order
        ? opts.order.indexOf(a[0]) - opts.order.indexOf(b[0])
        : b[1].length - a[1].length || a[0].localeCompare(b[0]),
    );
    return {
      title,
      note: opts.note,
      rows: ordered
        .filter(([, members]) => members.length >= (opts.minTotal ?? 0))
        .map(([label, members]) => {
          const reasons = members.map((r) => reasonOf.get(r)).filter(Boolean);
          return {
            label,
            total: members.length,
            rejectRate: pct(reasons.length, members.length),
            shares: columns.map((c) => pct(reasons.filter((x) => x === c).length, members.length)),
            lowSample: members.length < softSample,
          };
        }),
    };
  };

  const months = [...new Set(valid.map((r) => r.month))].sort();

  return {
    submitted: rows.length,
    valid: valid.length,
    validRejected: validRejected.length,
    invalidRejected: invalidRejected.length,
    cancelled: cancelled.length,
    cancelledUnassigned: cancelled.filter((r) => r.manager === null).length,
    noContact: [...reasonOf.values()].filter((x) => x === "연락 안됨").length,
    asOf,
    validReasons,
    invalidReasons: shareBreakdown(invalidRejected.map((r) => classifyRejectReason(r.reject_reason))),
    cancelTypes: shareBreakdown(cancelled.map((r) => classifyCancelType(r.raw_cancel_type))),
    byMonth: months.map((month) => {
      const members = valid.filter((r) => r.month === month);
      const n = members.filter((r) => reasonOf.has(r)).length;
      return {
        label: month,
        decided: members.length,
        rate: pct(n, members.length),
        ...(members.length < softSample ? { lowSample: true } : {}),
      };
    }),
    columns,
    segments: [
      segment("대표 분야", (r) => r.field, {
        note: `분야가 60종이 넘어 유효 제출이 ${softSample}건 이상인 분야만 싣습니다.`,
        minTotal: softSample,
      }),
      segment("사업 형태", (r) => r.business_form),
      segment("가입 경로", (r) => r.acquisition, {
        note: "고객 계정의 가입 경로입니다. 이번 제출의 유입 경로가 아닙니다.",
      }),
      segment("이전 모집 경험", (r) => r.history, {
        note: "이 제출 전에 위시켓에서 모집까지 간 프로젝트가 있었는지입니다. 제출만 해 본 고객은 «없음»입니다.",
      }),
      segment("직군 조합", (r) => r.job_types, {
        note:
          "고객이 비워 두면 검수 중에 채워지는 항목입니다. «미입력»은 검수가 진행되지 않은 건과 겹쳐 거절의 원인으로 읽지 않습니다.",
      }),
      segment("제출 시 첨부", (r) => r.attachment),
      segment("제출 시 예산", (r) => budgetBucket(r.initial_budget), {
        note:
          "본진 초기값 스냅샷의 예산입니다. 제출 당시 값인지는 일부만 검증됐습니다. " +
          "대부분 비어 있어 «미입력»이 큽니다.",
        order: BUDGET_ORDER,
      }),
    ],
  };
}
