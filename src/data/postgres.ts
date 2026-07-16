import { query } from "@/lib/db";
import { managerFilterSql, managerName } from "@/lib/managers";
import {
  daysBetween,
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
  Breakdown,
  CallRecord,
  CaseReview,
  IssueLogEntry,
  KanbanColumn,
  Posting,
  Project,
  ProjectFull,
  ProjectPage,
  ProjectQuery,
  ProjectStatus,
  QnaItem,
  ReportStats,
  TimelineEvent,
  TranscriptLine,
} from "./types";

/** 목록/칸반 한 페이지 기본 건수 */
export const DEFAULT_PAGE_SIZE = 50;
export const KANBAN_PAGE_SIZE = 30;

/** 칸반 컬럼 순서 */
const KANBAN_ORDER: ProjectStatus[] = [
  "검수",
  "모집",
  "계약",
  "진행",
  "완료(성공)",
  "완료(취소)",
];

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
  recruit_started_at: Date | null;
  progress_started_at: Date | null;
  completed_at: Date | null;
  cancelled_at: Date | null;
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
  transcript: string | null;
  user_type: string | null;
  confidence: string | null;
  created_at: string | null;
}

interface MeetingRow {
  partner_slug: string | null;
  summary: string | null;
  transcript: string | null;
  match_reason: string | null;
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
  p.cancel_stage, p.cancel_reason,
  p.submitted_at, p.recruit_started_at, p.progress_started_at, p.completed_at, p.cancelled_at,
  p.source_modified_at,
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

/** 통화 API STT. 원문은 통짜 텍스트(transcript)로 오므로 구조화 lines는 비운다 (2026-07-15). */
function toCallRecord(c: CallRow): CallRecord {
  return {
    title: c.call_type ?? "통화",
    date: formatMonthDay(c.created_at),
    summary: (c.summary ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    lines: [],
    transcript: c.transcript ?? null,
    userType: c.user_type ?? null,
    confidence: c.confidence ?? null,
  };
}

/**
 * 녹취 전문을 구조화 lines로 파싱. 녹취 서버(STT) 실제 형식은 대괄호 없는
 * "MM:SS 역할: 발화" (예: `00:02 차현지: ...`)다. 과거 파서는 `[MM:SS]`(대괄호)만
 * 매칭해 한 줄도 안 잡혀 전문이 통째로 사라졌다 (2026-07-16 수정).
 * 대괄호 유무·HH:MM:SS 모두 허용하고, "## 전문" 이후만 파싱해 요약/헤더 줄을 버린다.
 */
function parseTranscriptLines(transcript: string | null): TranscriptLine[] {
  if (!transcript) return [];
  const marker = "## 전문";
  const i = transcript.indexOf(marker);
  const body = i >= 0 ? transcript.slice(i + marker.length) : transcript;
  const lines: TranscriptLine[] = [];
  for (const raw of body.split("\n")) {
    const m = raw.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*([^:]+):\s*(.*)$/);
    if (m) lines.push({ t: m[1], who: m[2].trim(), text: m[3].trim() });
  }
  return lines;
}

/** 사전 미팅 녹취 — 전문을 [MM:SS] 역할: 발화 로 파싱해 구조화 lines로 낸다 (mock과 같은 3열 뷰). */
function toMeetingRecord(m: MeetingRow): CallRecord {
  return {
    title: m.partner_slug ?? "개발사 미팅",
    date: formatMonthDay(m.created_at),
    summary: (m.summary ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    lines: parseTranscriptLines(m.transcript),
    // 미팅 전문은 마크다운 회의록이라 구조화 lines가 0줄이다 — 원문을 그대로 넘겨 렌더한다.
    transcript: m.transcript ?? null,
    matchReason: m.match_reason ?? null,
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
    reviewedAt: formatMonthDay(row.recruit_started_at),
    reviewedDaysAgo: row.recruit_started_at ? daysSince(row.recruit_started_at) : null,
    durations: {
      inspection: daysBetween(row.submitted_at, row.recruit_started_at),
      recruiting: daysBetween(row.recruit_started_at, row.progress_started_at),
      progress: daysBetween(row.progress_started_at, row.completed_at),
      // 취소된 프로젝트는 완료일이 없다 — 취소 시점까지를 총 기간으로 본다
      total: daysBetween(row.submitted_at, row.completed_at ?? row.cancelled_at),
    },
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
  detail: {
    call: CallRecord;
    calls: CallRecord[];
    meetings: CallRecord[];
    qna: QnaItem[];
    timeline: TimelineEvent[];
  },
): ProjectFull {
  return {
    ...toProject(row),
    intake: {
      posting: row.posting_structured ?? fallbackPosting(row.title, row.posting_raw ?? null),
      call: detail.call,
    },
    calls: detail.calls,
    meetings: detail.meetings,
    issueLog: row.issue_log ?? [],
    qna: detail.qna,
    timeline: detail.timeline,
  };
}

/**
 * 계약률의 분모는 "결판난 건"이다 — 계약 도달(stage>=3, 취소 아님) + 취소.
 * 모집 중인 282건은 결과가 안 나왔으므로 분모에서 뺀다.
 */
const DECIDED = `(stage >= 3 AND status <> '완료(취소)') OR status = '완료(취소)'`;
const WON = `stage >= 3 AND status <> '완료(취소)'`;

/** 표본이 이보다 적은 구간은 리포트에 싣지 않는다 — 비율이 우연에 흔들린다 */
const MIN_SAMPLE = 100;

/** 검색 토큰 상한 — 쿼리 길이를 묶는다 */
const SEARCH_MAX_TOKENS = 6;

/** ILIKE 패턴 특수문자(\ % _)를 리터럴로 이스케이프 (기본 ESCAPE '\') */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * 목록/칸반 공통 WHERE 절을 파라미터화해서 만든다.
 * 검색은 토큰 간 AND, 필드(제목·본문·고객사·기술·카테고리) 간 OR.
 * @param includeStatus 칸반은 상태 드롭다운을 무시하므로 false로 뺀다.
 */
function buildWhere(q: ProjectQuery, includeStatus: boolean): { sql: string; params: unknown[] } {
  const conds: string[] = ["p.deleted_at IS NULL", "p.hidden = false"];
  const params: unknown[] = [];
  const add = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  if (includeStatus && q.status && q.status !== "전체") {
    conds.push(`p.status = ${add(q.status)}`);
  }

  const mf = managerFilterSql(q.manager ?? "전체");
  if (mf.kind === "in") {
    conds.push(`p.inspection_manager = ANY(${add(mf.accounts)}::text[])`);
  } else if (mf.kind === "other") {
    conds.push(
      `(p.inspection_manager IS NULL OR p.inspection_manager <> ALL(${add(mf.primaryAccounts)}::text[]))`,
    );
  }

  // 기간: 검수완료일(모집 전환일) 기준 최근 N일. daysSince가 floor(일 차이)라
  // reviewedDaysAgo <= N ⟺ 경과가 (N+1)일 미만 ⟺ recruit_started_at > now - (N+1)일.
  if (q.periodDays != null && Number.isFinite(q.periodDays)) {
    conds.push(`p.recruit_started_at > now() - (INTERVAL '1 day' * ${add(q.periodDays + 1)})`);
  }

  // ★관심: 켜졌으나 관심 항목이 없으면 결과 없음
  if (q.starredIds) {
    if (q.starredIds.length === 0) conds.push("false");
    else conds.push(`p.id = ANY(${add(q.starredIds)}::bigint[])`);
  }

  const tokens = (q.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, SEARCH_MAX_TOKENS);
  for (const t of tokens) {
    const like = add(`%${escapeLike(t)}%`);
    conds.push(
      `(p.title ILIKE ${like} OR p.client_name ILIKE ${like} OR p.tech ILIKE ${like} OR p.category ILIKE ${like} OR p.posting_raw ILIKE ${like})`,
    );
  }

  return { sql: conds.join(" AND "), params };
}

interface BreakdownRow {
  label: string | null;
  decided: string;
  rate: string | null;
}

function toBreakdown(rows: BreakdownRow[]): Breakdown[] {
  return rows
    .filter((r) => r.label !== null)
    .map((r) => ({
      label: r.label as string,
      decided: Number(r.decided),
      rate: Number(r.rate ?? 0),
    }));
}

export class PostgresDataSource implements DataSource {
  async getReportStats(): Promise<ReportStats> {
    const live = `FROM projects WHERE deleted_at IS NULL AND hidden = false`;

    const [totals] = await query<{
      total: string;
      contracted: string;
      cancelled: string;
      pending: string;
    }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE ${WON})                                AS contracted,
              count(*) FILTER (WHERE status = '완료(취소)')                  AS cancelled,
              count(*) FILTER (WHERE stage < 3 AND status <> '완료(취소)')   AS pending
         ${live}`,
    );

    const cancelByStage = await query<BreakdownRow>(
      `SELECT cancel_stage AS label, count(*) AS decided,
              round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS rate
         ${live} AND status = '완료(취소)' AND cancel_stage IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC`,
    );

    const byBudget = await query<BreakdownRow>(
      `SELECT CASE WHEN budget <  10000000 THEN '1천만 미만'
                   WHEN budget <  30000000 THEN '1~3천만'
                   WHEN budget <  50000000 THEN '3~5천만'
                   WHEN budget < 100000000 THEN '5천~1억'
                   ELSE '1억 이상' END AS label,
              count(*) FILTER (WHERE ${DECIDED}) AS decided,
              round(100.0 * count(*) FILTER (WHERE ${WON})
                    / NULLIF(count(*) FILTER (WHERE ${DECIDED}), 0), 1) AS rate
         ${live} AND budget IS NOT NULL
        GROUP BY 1 HAVING count(*) FILTER (WHERE ${DECIDED}) >= ${MIN_SAMPLE}
        ORDER BY min(budget)`,
    );

    const byScope = await query<BreakdownRow>(
      `SELECT dev_scope AS label,
              count(*) FILTER (WHERE ${DECIDED}) AS decided,
              round(100.0 * count(*) FILTER (WHERE ${WON})
                    / NULLIF(count(*) FILTER (WHERE ${DECIDED}), 0), 1) AS rate
         ${live} AND dev_scope IS NOT NULL
        GROUP BY 1 HAVING count(*) FILTER (WHERE ${DECIDED}) >= ${MIN_SAMPLE}
        ORDER BY 3 DESC`,
    );

    const byProposals = await query<BreakdownRow>(
      `SELECT CASE WHEN proposal_count = 0            THEN '0건'
                   WHEN proposal_count BETWEEN 1 AND 4   THEN '1~4건'
                   WHEN proposal_count BETWEEN 5 AND 9   THEN '5~9건'
                   WHEN proposal_count BETWEEN 10 AND 19 THEN '10~19건'
                   ELSE '20건 이상' END AS label,
              count(*) FILTER (WHERE ${DECIDED}) AS decided,
              round(100.0 * count(*) FILTER (WHERE ${WON})
                    / NULLIF(count(*) FILTER (WHERE ${DECIDED}), 0), 1) AS rate
         ${live} AND proposal_count IS NOT NULL
        GROUP BY 1 ORDER BY min(proposal_count)`,
    );

    const [days] = await query<{ inspection: string; recruiting: string; progress: string }>(
      `SELECT
         percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM recruit_started_at - submitted_at))       AS inspection,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM progress_started_at - recruit_started_at)) AS recruiting,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM completed_at - progress_started_at))       AS progress
       ${live}`,
    );

    const [delta] = await query<{ increased: string; same: string; decreased: string }>(
      `SELECT count(*) FILTER (WHERE contract_amount > budget) AS increased,
              count(*) FILTER (WHERE contract_amount = budget) AS same,
              count(*) FILTER (WHERE contract_amount < budget) AS decreased
         ${live} AND contract_amount IS NOT NULL AND budget > 0`,
    );

    const decided = Number(totals.contracted) + Number(totals.cancelled);

    return {
      total: Number(totals.total),
      contracted: Number(totals.contracted),
      cancelled: Number(totals.cancelled),
      pending: Number(totals.pending),
      contractRate: decided ? Math.round((Number(totals.contracted) / decided) * 1000) / 10 : 0,
      cancelByStage: toBreakdown(cancelByStage),
      byBudget: toBreakdown(byBudget),
      byScope: toBreakdown(byScope),
      byProposals: toBreakdown(byProposals),
      medianDays: {
        inspection: Math.round(Number(days?.inspection ?? 0)),
        recruiting: Math.round(Number(days?.recruiting ?? 0)),
        progress: Math.round(Number(days?.progress ?? 0)),
      },
      budgetDelta: {
        increased: Number(delta?.increased ?? 0),
        same: Number(delta?.same ?? 0),
        decreased: Number(delta?.decreased ?? 0),
      },
    };
  }

  async getProjects(params: ProjectQuery): Promise<ProjectPage> {
    const page = Math.max(1, params.page ?? 1);
    const size = params.pageSize ?? DEFAULT_PAGE_SIZE;
    const { sql, params: whereParams } = buildWhere(params, true);
    const limit = `$${whereParams.length + 1}`;
    const offset = `$${whereParams.length + 2}`;

    // count(*) OVER() 로 필터 적용 후 전체 건수를 페이지 행과 함께 한 번에 받는다.
    // 정렬은 화면에 표시하는 날짜(검수완료일)와 같아야 "정렬 안 된 것처럼" 안 보인다.
    const rows = await query<ProjectRow & { total: string }>(
      `SELECT ${LIST_COLUMNS}, count(*) OVER() AS total
         FROM projects p
         LEFT JOIN ai_insights ai ON ai.project_id = p.id
        WHERE ${sql}
        ORDER BY p.recruit_started_at DESC NULLS LAST, p.id DESC
        LIMIT ${limit} OFFSET ${offset}`,
      [...whereParams, size, (page - 1) * size],
    );
    return {
      rows: rows.map(toProject),
      total: rows[0] ? Number(rows[0].total) : 0,
    };
  }

  async getKanban(params: ProjectQuery): Promise<KanbanColumn[]> {
    // 칸반은 상태 드롭다운을 무시한다(컬럼 자체가 상태). 상태별 상위 N + 총계를 한 쿼리로.
    const { sql, params: whereParams } = buildWhere(params, false);
    const rows = await query<ProjectRow & { status_total: string; rn: string }>(
      `SELECT * FROM (
         SELECT ${LIST_COLUMNS},
                count(*) OVER (PARTITION BY p.status) AS status_total,
                row_number() OVER (PARTITION BY p.status
                  ORDER BY p.recruit_started_at DESC NULLS LAST, p.id DESC) AS rn
           FROM projects p
           LEFT JOIN ai_insights ai ON ai.project_id = p.id
          WHERE ${sql}
       ) t
       WHERE rn <= ${KANBAN_PAGE_SIZE}`,
      whereParams,
    );

    const byStatus = new Map<string, { total: number; items: Project[] }>();
    for (const r of rows) {
      const col = byStatus.get(r.status) ?? { total: Number(r.status_total), items: [] };
      col.items.push(toProject(r));
      byStatus.set(r.status, col);
    }
    // 빈 컬럼도 순서대로 채운다
    return KANBAN_ORDER.map((status) => {
      const col = byStatus.get(status);
      return { status, total: col?.total ?? 0, items: col?.items ?? [] };
    });
  }

  async getProject(id: string): Promise<ProjectFull | undefined> {
    // DB의 id가 BIGINT 타입이므로, 숫자가 아닌 문자열(예: 'p3')이 들어오면 DB 에러 대신 404를 위해 undefined 반환
    if (!/^\d+$/.test(id)) return undefined;

    // 한 번의 왕복으로 끝낸다 — Neon이 싱가포르라 쿼리당 왕복 비용이 크다.
    // 쿼리를 3번 나눠 날리면 네트워크 지연만 3배가 된다.
    const rows = await query<
      ProjectRow & {
        events: TimelineRow[] | null;
        calls: CallRow[] | null;
        meetings: MeetingRow[] | null;
      }
    >(
      `SELECT ${DETAIL_COLUMNS},
         (SELECT json_agg(e ORDER BY e.event_at)
            FROM (SELECT source, event_at, stage, title, body, meta
                    FROM timeline_events WHERE project_id = p.id) e) AS events,
         (SELECT json_agg(c ORDER BY c.created_at)
            FROM (SELECT call_type, summary, transcript, user_type, confidence, created_at
                    FROM calls WHERE project_id = p.id) c) AS calls,
         (SELECT json_agg(mt ORDER BY mt.created_at)
            FROM (SELECT partner_slug, summary, transcript, match_reason, created_at
                    FROM meetings WHERE project_id = p.id) mt) AS meetings
         FROM projects p
         LEFT JOIN ai_insights ai ON ai.project_id = p.id
        WHERE p.id = $1 AND p.deleted_at IS NULL AND p.hidden = false`,
      [id],
    );
    const row = rows[0];
    if (!row) return undefined;

    const events = row.events ?? [];
    const calls = row.calls ?? [];
    const meetings = row.meetings ?? [];

    return toProjectFull(row, {
      call: calls[0] ? toCallRecord(calls[0]) : EMPTY_CALL,
      calls: calls.map(toCallRecord),
      meetings: meetings.map(toMeetingRecord),
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
