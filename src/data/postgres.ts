import { query } from "@/lib/db";
import { managerName } from "@/lib/managers";
import {
  daysSince,
  formatDays,
  formatMonthDay,
  formatMonthDayTime,
  formatMonthlyWon,
  formatWon,
} from "@/lib/format";
import type { DataSource } from "./source";
import type {
  AppNotification,
  CallRecord,
  CaseReview,
  IssueLogEntry,
  Posting,
  Project,
  ProjectFull,
  ProjectStatus,
  QnaItem,
  TimelineEvent,
} from "./types";

/** BIGINT·NUMERIC은 pg 드라이버에서 문자열로 돌아온다 */
interface ProjectRow {
  id: string;
  title: string;
  client_name: string | null;
  category: string | null;
  tech: string | null;
  /** "개발,디자인,기획" — 본진 job_jobcategory.title_kor 를 콤마로 이어붙인 값 */
  dev_scope: string | null;
  is_turnkey: boolean | null;
  planning_status: string | null;
  proposal_count: number | null;
  budget: string | null;
  budget_monthly: boolean;
  term_days: number | null;
  status: string;
  stage: number;
  inspection_manager: string | null;
  agreement_id: string | null;
  contract_amount: string | null;
  contract_term_days: number | null;
  cancel_stage: string | null;
  cancel_reason: string | null;
  submitted_at: Date | null;
  source_modified_at: Date | null;
  /** 아래는 상세(DETAIL_COLUMNS)에서만 조회된다 — 목록에서는 undefined */
  posting_raw?: string | null;
  risk_tags?: string[] | null;
  issue_log?: IssueLogEntry[] | null;
  posting_structured?: Posting | null;
}

/** json_agg로 묶여 오므로 날짜는 Date가 아니라 ISO 문자열이다 */
interface TimelineRow {
  source: string;
  event_at: string;
  stage: string | null;
  title: string | null;
  body: string | null;
  meta: {
    field?: string;
    before?: unknown;
    after?: unknown;
    by?: string;
    at_stage?: string;
    /** qna 전용 — 클라이언트에게만 보이던 비공개 문의 */
    is_private?: boolean;
  } | null;
}

interface CallRow {
  call_type: string | null;
  summary: string | null;
  created_at: string | null;
}

/**
 * 목록용 — 상세 전용 컬럼은 절대 넣지 않는다.
 * posting_raw(공고 원문)는 5,300건 합계가 12MB다. 목록은 쓰지도 않는데 가져오면
 * 싱가포르에서 12MB를 끌어와 "use client"인 ProjectList의 RSC 페이로드로 브라우저까지 실어나른다.
 * 목록이 실제로 쓰는 필드 합계는 421KB다.
 */
const LIST_COLUMNS = `
  p.id, p.title, p.client_name, p.category, p.tech, p.budget, p.budget_monthly, p.term_days,
  p.dev_scope, p.is_turnkey, p.planning_status, p.proposal_count,
  p.status, p.stage, p.inspection_manager, p.agreement_id, p.contract_amount, p.contract_term_days,
  p.cancel_stage, p.cancel_reason, p.submitted_at, p.source_modified_at,
  ai.risk_tags
`;

/** 상세용 — 목록 컬럼 + 공고 원문 + 무거운 AI JSONB */
const DETAIL_COLUMNS = `
  ${LIST_COLUMNS}, p.posting_raw,
  ai.issue_log, ai.posting_structured
`;

/** AI 공고문 구조화 전(프롬프트 검토 대기)에는 원문을 배경 자리에 그대로 노출한다 (§3) */
function fallbackPosting(title: string, raw: string | null): Posting {
  return {
    title,
    background: raw ?? "",
    scopeSummary: [],
    featureGroups: [],
    nonFunctional: [],
    techStack: [],
    schedule: { start: "", milestones: [], due: "" },
    qualRequired: [],
    qualPreferred: [],
    deliverables: [],
  };
}

const EMPTY_CALL: CallRecord = { title: "", date: "", summary: [], lines: [] };

/** 녹취 원문·전화번호는 CaseLab에 저장되지 않는다 → lines는 항상 비어 있다 (§3) */
function toCallRecord(c: CallRow): CallRecord {
  return {
    title: c.call_type ?? "통화 요약",
    date: formatMonthDay(c.created_at),
    summary: (c.summary ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    lines: [],
  };
}

/** 서버가 생성한 change 이벤트의 meta → 사람이 읽는 문장 (포맷은 여기 한 곳에서만) */
function changeDesc(meta: TimelineRow["meta"]): string {
  if (!meta) return "";
  const { field, before, after } = meta;
  const pair = (fmt: (v: unknown) => string | null): string =>
    `${fmt(before as never) ?? "-"} → ${fmt(after as never) ?? "-"}`;

  switch (field) {
    case "budget":
    case "contract_amount":
      return pair((v) => formatWon(v as number | string | null));
    case "term_days":
      return pair((v) => formatDays(v as number | string | null));
    case "deadline":
      return pair((v) => formatMonthDay(v as string | null) || null);
    default:
      return `${before ?? "-"} → ${after ?? "-"}`;
  }
}

function toTimelineEvent(r: TimelineRow): TimelineEvent {
  const isStatusChange = r.source === "status";
  return {
    stage: r.stage ?? "",
    date: formatMonthDay(r.event_at),
    title: r.title ?? "",
    desc: r.source === "change" ? changeDesc(r.meta) : (r.body ?? ""),
    ...(isStatusChange && r.meta?.after === "완료(취소)" ? { cancel: true } : {}),
  };
}

function toQna(r: TimelineRow): QnaItem {
  return {
    q: r.title ?? "",
    a: r.body ?? null, // 답글 — 없으면 아직 아무도 답하지 않은 문의다
    by: r.meta?.by ?? "",
    at: formatMonthDay(r.event_at),
    isPrivate: r.meta?.is_private === true,
  };
}

/** 목록용 — 상세 필드는 붙이지 않는다 (빈 껍데기만으로 6천 건 × ~800B = 5MB) */
function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.title,
    client: row.client_name ?? "",
    cat: row.category ?? "",
    tech: row.tech ?? "",
    devScope: row.dev_scope ? row.dev_scope.split(",").filter(Boolean) : [],
    isTurnkey: row.is_turnkey,
    planningStatus: row.planning_status,
    proposalCount: row.proposal_count,
    // 기간제는 월 단가라 총액과 구분해서 표기해야 한다 ("월 600만원")
    budget: (row.budget_monthly ? formatMonthlyWon(row.budget) : formatWon(row.budget)) ?? "",
    period: formatDays(row.term_days) ?? "",
    status: row.status as ProjectStatus,
    stage: row.stage as 1 | 2 | 3 | 4 | 5,
    manager: managerName(row.inspection_manager),
    updated: formatMonthDay(row.source_modified_at),
    submittedAt: row.submitted_at ? formatMonthDay(row.submitted_at) : "-",
    daysAgo: daysSince(row.source_modified_at),
    submittedDaysAgo: row.submitted_at ? daysSince(row.submitted_at) : null,
    contractAmount: formatWon(row.contract_amount),
    contractPeriod: formatDays(row.contract_term_days),
    agreementId: row.agreement_id,
    ...(row.cancel_stage
      ? { cancel: { stage: row.cancel_stage, reason: row.cancel_reason ?? "" } }
      : {}),
    riskTags: row.risk_tags ?? [],
  };
}

function toProjectFull(
  row: ProjectRow,
  detail: { call: CallRecord; qna: QnaItem[]; timeline: TimelineEvent[] },
): ProjectFull {
  return {
    ...toProject(row),
    intake: {
      posting: row.posting_structured ?? fallbackPosting(row.title, row.posting_raw ?? null),
      call: detail.call,
    },
    issueLog: row.issue_log ?? [],
    qna: detail.qna,
    timeline: detail.timeline,
  };
}

export class PostgresDataSource implements DataSource {
  async getProjects(): Promise<Project[]> {
    const rows = await query<ProjectRow>(
      `SELECT ${LIST_COLUMNS}
         FROM projects p
         LEFT JOIN ai_insights ai ON ai.project_id = p.id
        WHERE p.deleted_at IS NULL AND p.hidden = false
        ORDER BY p.submitted_at DESC NULLS LAST, p.source_modified_at DESC`,
    );
    return rows.map(toProject);
  }

  async getProject(id: string): Promise<ProjectFull | undefined> {
    // DB의 id가 BIGINT 타입이므로, 숫자가 아닌 문자열(예: 'p3')이 들어오면 DB 에러 대신 404를 위해 undefined 반환
    if (!/^\d+$/.test(id)) return undefined;

    // 한 번의 왕복으로 끝낸다 — Neon이 싱가포르라 쿼리당 왕복 비용이 크다.
    // 쿼리를 3번 나눠 날리면 네트워크 지연만 3배가 된다.
    const rows = await query<ProjectRow & { events: TimelineRow[] | null; calls: CallRow[] | null }>(
      `SELECT ${DETAIL_COLUMNS},
         (SELECT json_agg(e ORDER BY e.event_at)
            FROM (SELECT source, event_at, stage, title, body, meta
                    FROM timeline_events WHERE project_id = p.id) e) AS events,
         (SELECT json_agg(c ORDER BY c.created_at)
            FROM (SELECT call_type, summary, created_at
                    FROM calls WHERE project_id = p.id) c) AS calls
         FROM projects p
         LEFT JOIN ai_insights ai ON ai.project_id = p.id
        WHERE p.id = $1 AND p.deleted_at IS NULL AND p.hidden = false`,
      [id],
    );
    const row = rows[0];
    if (!row) return undefined;

    const events = row.events ?? [];
    const calls = row.calls ?? [];

    return toProjectFull(row, {
      call: calls[0] ? toCallRecord(calls[0]) : EMPTY_CALL,
      qna: events.filter((e) => e.source === "qna").map(toQna),
      timeline: events.filter((e) => e.source !== "qna").map(toTimelineEvent),
    });
  }

  /** 알림은 아직 원천이 없다 (본진에 대응 테이블 없음) */
  async getNotifications(): Promise<AppNotification[]> {
    return [];
  }

  async getReviews(): Promise<Record<string, CaseReview>> {
    const rows = await query<{
      project_id: string;
      checks: boolean[];
      comment: string | null;
      saved_at: Date;
    }>("SELECT project_id, checks, comment, saved_at FROM reviews");

    return Object.fromEntries(
      rows.map((r) => [
        r.project_id,
        {
          checks: r.checks,
          comment: r.comment ?? "",
          savedAt: formatMonthDayTime(r.saved_at),
        },
      ]),
    );
  }

  async saveReview(projectId: string, review: CaseReview): Promise<void> {
    await query(
      `INSERT INTO reviews (project_id, checks, comment, saved_at)
       VALUES ($1, $2::boolean[], $3, now())
       ON CONFLICT (project_id) DO UPDATE SET
         checks   = EXCLUDED.checks,
         comment  = EXCLUDED.comment,
         saved_at = now()`,
      [projectId, review.checks, review.comment],
    );
  }
}
