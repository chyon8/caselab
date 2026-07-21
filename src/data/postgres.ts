import { query } from "@/lib/db";
import { managerFilterSql, managerName } from "@/lib/managers";
import type { PoolQna } from "@/lib/review-tips";
import {
  daysBetween,
  daysSince,
  formatDays,
  formatMonthDay,
  formatMonthDayTime,
  formatYmd,
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
  KanbanStatus,
  Posting,
  Project,
  ProjectFull,
  ProjectPage,
  ProjectQuery,
  ProjectStatus,
  QnaItem,
  QnaSummary,
  ReportStats,
  SimilarProject,
  SimilarStats,
  TimelineEvent,
  TranscriptLine,
} from "./types";

/** 목록/칸반 한 페이지 기본 건수 */
export const DEFAULT_PAGE_SIZE = 50;
export const KANBAN_PAGE_SIZE = 30;

/** 칸반 컬럼 순서. '미팅중'은 모집(사전 미팅 진행분)을 쪼갠 파생 컬럼 */
const KANBAN_ORDER: KanbanStatus[] = [
  "모집",
  "미팅중",
  "계약",
  "진행",
  "완료(성공)",
  "완료(취소)",
];

/** 모집 프로젝트가 사전 미팅을 시작했는지 — 타임라인에 source='meeting' 이벤트가 하나라도 있으면 참 */
const MEETING_STARTED = `EXISTS (SELECT 1 FROM timeline_events te WHERE te.project_id = p.id AND te.source = 'meeting')`;

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
  /** 목록·칸반에서만 계산 — 모집 단계에서 사전 미팅이 시작됐는지 */
  is_meeting?: boolean;
  /** 아래는 상세(DETAIL_COLUMNS)에서만 조회된다 — 목록에서는 undefined */
  posting_raw?: string | null;
  risk_tags?: string[] | null;
  issue_log?: IssueLogEntry[] | null;
  posting_structured?: Posting | null;
  qna_summary?: QnaSummary | null;
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
  ai.issue_log, ai.posting_structured, ai.qna_summary
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

/**
 * 생애주기 마일스톤을 프로젝트의 날짜 컬럼에서 직접 합성한다.
 * 타임라인의 상태 전이(source='status')는 백필 이후 값이 바뀐 소수 프로젝트에만 생겨서
 * (진행 240건 중 7건뿐) 대부분이 '진행 착수' 같은 단계 마커를 잃었다. 날짜 컬럼은 전량 있으므로
 * 여기서 조회 시 합성해 채운다 — DB 백필·마이그레이션 없음. status 전이 이벤트와 겹치므로
 * getProject에서 source='status'는 표시에서 뺀다(source='change' 값 변경 이벤트는 유지).
 * ('선정·계약 체결'만의 별도 날짜 컬럼은 없어 '진행 착수'가 선정 이후를 나타내는 마커다.)
 */
function lifecycleEvents(row: ProjectRow): { at: number; ev: TimelineEvent }[] {
  const out: { at: number; ev: TimelineEvent }[] = [];
  const push = (d: Date | null, stage: string, title: string, cancel = false): void => {
    if (!d) return;
    out.push({
      at: d.getTime(),
      ev: { stage, date: formatMonthDay(d), title, desc: "", ...(cancel ? { cancel: true } : {}) },
    });
  };
  push(row.recruit_started_at, "모집", "모집 시작");
  push(row.progress_started_at, "진행", "진행 착수");
  push(row.completed_at, "완료", "완료");
  push(row.cancelled_at, "완료(취소)", "취소", true);
  return out;
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
    ...(row.is_meeting ? { meetingActive: true } : {}),
    manager: managerName(row.inspection_manager),
    updated: formatMonthDay(row.source_modified_at),
    submittedAt: row.submitted_at ? formatMonthDay(row.submitted_at) : "-",
    daysAgo: daysSince(row.source_modified_at),
    reviewedAt: formatMonthDay(row.recruit_started_at),
    reviewedAtFull: formatYmd(row.recruit_started_at),
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
    qnaSummary: row.qna_summary ?? undefined,
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

/** 유사사례 집계 통계 — 코사인 유사도 상위 N건을 표본으로 삼는다(카드로 보여주는 5~8건보다 크게) */
const SIMILAR_STATS_POOL = 30;
/** 표본이 이보다 적으면 계약률·취소단계·모집기간·예산증감은 숨긴다 — 리포트 MIN_SAMPLE(100)보다 훨씬 작다 */
const SIMILAR_MIN_DECIDED = 5;
/** dev_scope 조합별 계약금액은 이보다 적은 조합이면 숨긴다 */
const SIMILAR_MIN_SCOPE = 3;
/** 업무범위(dev_scope) 정확일치 시 코사인 거리에서 빼주는 소프트 부스트 —
 *  하드 필터가 아니라 순위 조정. 실측으로 진짜 강한 매치는 안 밀어내는 값으로 보정(0.02). */
const SCOPE_BOOST = 0.02;

/**
 * 유사도 하한 — 풀을 항상 30건으로 채우지 않고, 최고점에서 이만큼 멀어지면 자른다.
 *
 * ⚠️ 절대 임계값을 쓰면 안 된다. 유사도 스케일이 쿼리마다 달라서다(실측):
 *   "앱 유지보수" 쿼리는 1위 0.687 / 8위 0.634인데, "여행 홈페이지" 쿼리는 30위가 0.660이다.
 *   0.65 같은 고정 컷은 앞 검색을 통째로 날리면서 뒤 검색은 하나도 못 거른다.
 * 그래서 상대 거리로 자른다. 결과가 적으면 적게 보여주는 게 맞다 —
 * 억지로 30건을 채우면 무관한 사례가 통계·검수 팁의 재료로 섞여 일반론을 만든다.
 *
 * ⚠️ 기준은 1위가 아니라 2위다(2026-07-21 수정). 1위가 이상치(거의 중복 사례)면 마진을
 *   1위 기준으로 재는 순간 창이 통째로 끌려올라가 poolSize가 5 미만까지 줄어 통계·검수팁
 *   패널이 통째로 안 뜨는 문제가 실측됨(카드 컷을 바닥값만으로 바꾼 것과 같은 결함,
 *   NEXT_STEPS "재개 조건" 참조). 2위 기준으로 재면 1위 혼자 튀어도 나머지 창은 안정적이다.
 */
const SIMILAR_REL_MARGIN = 0.06;
/** 상대 컷과 별개인 바닥값 — 코퍼스 전체 중앙값이 0.477이라 이 아래는 사실상 무관하다 */
const SIMILAR_MIN_SIM = 0.5;
/**
 * 유사도 하한을 적용하는 SQL 조건 — raw CTE(유사도순 정렬·MATERIALIZED)를 받아 쓴다. 통계·검수팁 풀 전용.
 * 2위 sim이 없으면(풀이 1건) max(sim)으로 대체 — 1건뿐이면 이상치 문제 자체가 없다.
 */
const SIMILAR_CUTOFF = `sim >= greatest(
    COALESCE((SELECT sim FROM raw ORDER BY sim DESC OFFSET 1 LIMIT 1), (SELECT max(sim) FROM raw)) - ${SIMILAR_REL_MARGIN},
    ${SIMILAR_MIN_SIM}
  )`;

/**
 * 카드(사람이 직접 보고 판단)는 상대 컷을 쓰지 않고 바닥값만 적용한다.
 *
 * ⚠️ 상대 컷(1위 대비)을 카드에 쓰면 안 된다. 1위가 거의 중복인 사례일 때 창이 통째로 끌려올라간다(실측):
 *   아티스트 플랫폼 공고는 1위가 0.875(거의 같은 프로젝트)인데 2~12위는 0.725~0.703에 몰려 있어,
 *   마진 0.15로도 컷이 0.725까지 올라가 관련 있는 3위(0.715)부터 전부 잘렸다. 마진을 키워도
 *   1위가 더 튀는 문서가 오면 같은 일이 반복된다 — 이상치에 기준을 매다는 것 자체가 문제다.
 * 카드는 LIMIT 8로 이미 개수가 묶여 있고 화면에 유사도가 같이 찍혀 사람이 걸러낼 수 있으므로,
 * 무관한 게 섞이는 비용보다 관련 있는 게 안 보이는 비용이 크다.
 * (반대로 통계·검수팁은 자동 집계라 무관한 게 섞이면 일반론으로 수렴 — 그쪽은 SIMILAR_CUTOFF 유지.)
 */
const CARD_CUTOFF = `sim >= ${SIMILAR_MIN_SIM}`;

/** 기준 프로젝트에 임베딩이 없을 때(통계 풀을 만들 수 없음) */
const EMPTY_SIMILAR_STATS: SimilarStats = {
  poolSize: 0,
  decided: 0,
  contractRate: null,
  cancelByStage: [],
  recruitingDaysMedian: null,
  contractByScope: [],
  proposalBuckets: [],
  budgetDelta: null,
};

/** 검색 토큰 상한 — 쿼리 길이를 묶는다 */
const SEARCH_MAX_TOKENS = 6;

/**
 * 검색 관련도 필드 가중치. WHERE는 여전히 필드 간 OR(=recall 유지)이지만, 정렬은 이 점수로 한다.
 * 실측 근거: "유지보수" 한 단어가 1,023건을 맞히는데 그중 829건(81%)이 본문에만 스친 언급이다
 * ("유지보수는 별도 협의" 같은 상투구). 날짜순 정렬이면 그 829건이 앞을 다 덮는다.
 * 제목·카테고리에 있는 말이 그 프로젝트의 정체고, 본문에 있는 말은 곁가지다.
 */
const SEARCH_WEIGHT = { title: 10, categoryTech: 5, client: 3, body: 1 };

/** ILIKE 패턴 특수문자(\ % _)를 리터럴로 이스케이프 (기본 ESCAPE '\') */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * 목록/칸반 공통 WHERE 절을 파라미터화해서 만든다.
 * 검색은 토큰 간 AND, 필드(제목·본문·고객사·기술·카테고리) 간 OR.
 * @param includeStatus 칸반은 상태 드롭다운을 무시하므로 false로 뺀다.
 */
function buildWhere(
  q: ProjectQuery,
  includeStatus: boolean,
): { sql: string; params: unknown[]; score: string | null } {
  const conds: string[] = ["p.deleted_at IS NULL", "p.hidden = false"];
  const params: unknown[] = [];
  const add = (v: unknown): string => {
    params.push(v);
    return `$${params.length}`;
  };

  if (includeStatus && q.status && q.status !== "전체") {
    // '미팅중'/'모집'은 같은 status='모집'을 사전 미팅 진행 여부로 쪼갠 파생 필터다
    if (q.status === "미팅중") conds.push(`p.status = '모집' AND ${MEETING_STARTED}`);
    else if (q.status === "모집") conds.push(`p.status = '모집' AND NOT ${MEETING_STARTED}`);
    else conds.push(`p.status = ${add(q.status)}`);
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
  const likes: string[] = [];
  for (const t of tokens) {
    const like = add(`%${escapeLike(t)}%`);
    likes.push(like);
    conds.push(
      `(p.id::text ILIKE ${like} OR p.title ILIKE ${like} OR p.client_name ILIKE ${like} OR p.tech ILIKE ${like} OR p.category ILIKE ${like} OR p.posting_raw ILIKE ${like})`,
    );
  }

  // 관련도 점수 — 토큰이 어느 필드에서 맞았는지에 가중치를 주고 토큰별로 합산한다.
  // WHERE에서 이미 쓴 플레이스홀더를 그대로 재사용하므로 파라미터가 늘지 않는다.
  const score = likes.length
    ? likes
        .map(
          (l) =>
            `(CASE WHEN p.title ILIKE ${l} THEN ${SEARCH_WEIGHT.title} ELSE 0 END` +
            ` + CASE WHEN p.category ILIKE ${l} OR p.tech ILIKE ${l} THEN ${SEARCH_WEIGHT.categoryTech} ELSE 0 END` +
            ` + CASE WHEN p.client_name ILIKE ${l} THEN ${SEARCH_WEIGHT.client} ELSE 0 END` +
            ` + CASE WHEN p.posting_raw ILIKE ${l} THEN ${SEARCH_WEIGHT.body} ELSE 0 END)`,
        )
        .join(" + ")
    : null;

  return { sql: conds.join(" AND "), params, score };
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

interface ScopeAmountRow {
  label: string | null;
  n: string;
  median: string | null;
  q1: string | null;
  q3: string | null;
}

interface ProposalBucketRow {
  label: string | null;
  n: string;
  sort_key: string;
}

interface StatsRow {
  pool_size: string;
  decided: string;
  contracted: string;
  recruiting_days: string | null;
  recruiting_sample: string;
  budget_increased: string;
  budget_same: string;
  budget_decreased: string;
  budget_sample: string;
  cancel_by_stage: BreakdownRow[] | null;
  contract_by_scope: ScopeAmountRow[] | null;
  proposal_buckets: ProposalBucketRow[] | null;
}

function toSimilarStats(row: StatsRow): SimilarStats {
  const poolSize = Number(row.pool_size);
  const decided = Number(row.decided);
  const recruitingSample = Number(row.recruiting_sample);
  const budgetSample = Number(row.budget_sample);
  const enough = decided >= SIMILAR_MIN_DECIDED;

  return {
    poolSize,
    decided,
    contractRate: enough
      ? Math.round((Number(row.contracted) / decided) * 1000) / 10
      : null,
    cancelByStage: enough ? toBreakdown(row.cancel_by_stage ?? []) : [],
    recruitingDaysMedian:
      recruitingSample >= SIMILAR_MIN_DECIDED ? Math.round(Number(row.recruiting_days ?? 0)) : null,
    contractByScope: (row.contract_by_scope ?? [])
      .filter((s) => s.label !== null)
      .map((s) => ({
        label: s.label as string,
        count: Number(s.n),
        median: formatWon(s.median) ?? "-",
        q1: formatWon(s.q1) ?? "-",
        q3: formatWon(s.q3) ?? "-",
      })),
    proposalBuckets: poolSize >= SIMILAR_MIN_DECIDED
      ? (row.proposal_buckets ?? [])
          .filter((b) => b.label !== null)
          .sort((a, b) => Number(a.sort_key) - Number(b.sort_key))
          .map((b) => ({
            label: b.label as string,
            count: Number(b.n),
            rate: poolSize ? Math.round((Number(b.n) / poolSize) * 1000) / 10 : 0,
          }))
      : [],
    budgetDelta:
      budgetSample >= SIMILAR_MIN_DECIDED
        ? {
            increased: Number(row.budget_increased),
            same: Number(row.budget_same),
            decreased: Number(row.budget_decreased),
          }
        : null,
  };
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
    const { sql, params: whereParams, score } = buildWhere(params, true);
    const limit = `$${whereParams.length + 1}`;
    const offset = `$${whereParams.length + 2}`;

    // count(*) OVER() 로 필터 적용 후 전체 건수를 페이지 행과 함께 한 번에 받는다.
    // 정렬: 검색어가 없으면 화면에 표시하는 날짜(검수완료일) 순 — 표시값과 같아야 "정렬 안 된 것처럼"
    // 안 보인다. 검색어가 있으면 관련도 우선(동점은 최신순) — 날짜순만으로는 본문에 스친 언급이
    // 제목이 정확히 일치하는 건을 덮어버린다.
    const order = score
      ? `${score} DESC, p.recruit_started_at DESC NULLS LAST, p.id DESC`
      : `p.recruit_started_at DESC NULLS LAST, p.id DESC`;
    const rows = await query<ProjectRow & { total: string }>(
      `SELECT ${LIST_COLUMNS},
              (p.status = '모집' AND ${MEETING_STARTED}) AS is_meeting,
              count(*) OVER() AS total
         FROM projects p
         LEFT JOIN ai_insights ai ON ai.project_id = p.id
        WHERE ${sql}
        ORDER BY ${order}
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
    // 모집은 사전 미팅 진행분을 '미팅중' 가상 컬럼(kstatus)으로 쪼갠다 — 총계·row_number도 그 기준.
    const { sql, params: whereParams, score } = buildWhere(params, false);
    // 목록과 같은 규칙: 검색어가 있으면 컬럼 안에서도 관련도 우선으로 상위 N건을 고른다.
    const order = score
      ? `relevance DESC, recruit_started_at DESC NULLS LAST, id DESC`
      : `recruit_started_at DESC NULLS LAST, id DESC`;
    const rows = await query<ProjectRow & { kstatus: string; status_total: string; rn: string }>(
      `SELECT * FROM (
         SELECT *,
                count(*) OVER (PARTITION BY kstatus) AS status_total,
                row_number() OVER (PARTITION BY kstatus ORDER BY ${order}) AS rn
           FROM (
             SELECT ${LIST_COLUMNS},
                    (p.status = '모집' AND ${MEETING_STARTED}) AS is_meeting,
                    ${score ?? "0"} AS relevance,
                    CASE WHEN p.status = '모집' AND ${MEETING_STARTED} THEN '미팅중' ELSE p.status END AS kstatus
               FROM projects p
               LEFT JOIN ai_insights ai ON ai.project_id = p.id
              WHERE ${sql}
           ) base
       ) t
       WHERE rn <= ${KANBAN_PAGE_SIZE}`,
      whereParams,
    );

    const byStatus = new Map<string, { total: number; items: Project[] }>();
    for (const r of rows) {
      const col = byStatus.get(r.kstatus) ?? { total: Number(r.status_total), items: [] };
      col.items.push(toProject(r));
      byStatus.set(r.kstatus, col);
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
      // 생애주기 마일스톤(날짜 컬럼 합성) + 실제 이벤트를 시간순 병합.
      // source='status'는 합성 마일스톤과 중복이라 뺀다('change' 값 변경은 유지).
      timeline: [
        ...lifecycleEvents(row),
        ...events
          .filter((e) => e.source !== "qna" && e.source !== "status")
          .map((e) => ({ at: new Date(e.event_at).getTime(), ev: toTimelineEvent(e) })),
      ]
        .sort((a, b) => a.at - b.at)
        .map((x) => x.ev),
    });
  }

  /**
   * 유사사례(L2) 벡터 코어 — 주어진 벡터와 코사인 유사도(pgvector <=>)로 가까운 프로젝트.
   * 상세보기(기준 프로젝트 id)와 공고문 붙여넣기 검색(즉석 임베딩 벡터)이 공유한다.
   * @param vec  "[0.1,0.2,…]" 형태의 pgvector 리터럴 문자열
   * @param boostScope  dev_scope가 정확히 같은 프로젝트를 소프트 부스트(거리에서 BOOST만큼 뺌).
   *   하드 필터가 아니라 순위 조정 — 상세보기(자동)용. 강한 매치를 밀어내지 않는다.
   * @param filterScope  dev_scope가 정확히 같은 프로젝트만 남기는 하드 필터 — 공고문 검색에서
   *   유저가 업무범위를 명시적으로 골랐을 때 쓴다(그 범위 사례만 보고 싶다는 뜻).
   */
  private async similarByVector(
    vec: string,
    limit: number,
    excludeId?: string,
    boostScope?: string,
    filterScope?: string,
  ): Promise<SimilarProject[]> {
    const clauses: string[] = [];
    const params: unknown[] = [vec, limit];
    if (excludeId) {
      params.push(excludeId);
      clauses.push(`p.id <> $${params.length}`);
    }
    if (filterScope) {
      params.push(filterScope);
      clauses.push(`p.dev_scope = $${params.length}`);
    }
    let orderExpr = "p.embedding <=> $1::vector";
    if (boostScope) {
      params.push(boostScope);
      orderExpr = `(p.embedding <=> $1::vector) - (CASE WHEN p.dev_scope = $${params.length} THEN ${SCOPE_BOOST} ELSE 0 END)`;
    }
    const where = clauses.length ? `${clauses.join(" AND ")} AND ` : "";
    // 상위 N건을 뽑은 뒤 유사도 하한(CARD_CUTOFF)으로 한 번 더 자른다 — 결과가 하한에 못 미치면
    // 8건을 억지로 채우지 않고 적게 돌려준다. sort_key를 들고 나가야 부스트 순서가 보존된다.
    const rows = await query<ProjectRow & { similarity: number }>(
      `WITH raw AS MATERIALIZED (
         SELECT ${LIST_COLUMNS},
                1 - (p.embedding <=> $1::vector) AS sim,
                ${orderExpr} AS sort_key
           FROM projects p
           LEFT JOIN ai_insights ai ON ai.project_id = p.id
          WHERE ${where}p.embedding IS NOT NULL
            AND p.deleted_at IS NULL AND p.hidden = false
          ORDER BY ${orderExpr}
          LIMIT $2
       )
       SELECT *, sim AS similarity FROM raw
        WHERE ${CARD_CUTOFF}
        ORDER BY sort_key`,
      params,
    );
    return rows.map((r) => ({ ...toProject(r), similarity: Number(r.similarity) }));
  }

  /**
   * 상세보기 유사사례 — 기준 프로젝트의 저장된 임베딩으로 검색. OpenAI 호출 없음.
   * 기준 프로젝트의 dev_scope로 소프트 부스트(같은 업무범위를 살짝 우선). 임베딩 없으면 빈 배열.
   */
  async getSimilarProjects(id: string, limit = 5): Promise<SimilarProject[]> {
    if (!/^\d+$/.test(id)) return [];
    const base = await query<{ embedding: string | null; dev_scope: string | null }>(
      "SELECT embedding::text AS embedding, dev_scope FROM projects WHERE id = $1",
      [id],
    );
    const vec = base[0]?.embedding;
    if (!vec) return [];
    return this.similarByVector(vec, limit, id, base[0]?.dev_scope ?? undefined);
  }

  /**
   * 공고문 붙여넣기 검색 — 라우트에서 즉석 임베딩한 벡터로 유사사례를 찾는다.
   * scope(유저가 고른 업무범위)가 주어지면 그 dev_scope 사례만 하드 필터한다.
   */
  async searchSimilarByVector(vector: number[], limit = 8, scope?: string): Promise<SimilarProject[]> {
    return this.similarByVector(`[${vector.join(",")}]`, limit, undefined, undefined, scope);
  }

  /**
   * 검수 팁용 — 유사 풀(통계와 같은 30건)의 qna 요약(리스크·질문·키워드)을 가져온다.
   * 통계(숫자)와 달리 여기선 텍스트를 gpt로 묶어야 하므로 원문 배열이 필요하다.
   * scope(유저가 고른 업무범위)가 있으면 그 dev_scope 사례만 하드 필터한다.
   */
  async searchSimilarQnaPool(
    vector: number[],
    limit = SIMILAR_STATS_POOL,
    scope?: string,
  ): Promise<PoolQna[]> {
    const params: unknown[] = [`[${vector.join(",")}]`, limit];
    let scopeClause = "";
    if (scope) {
      params.push(scope);
      scopeClause = `AND p.dev_scope = $${params.length}`;
    }
    // 통계·카드와 같은 유사도 하한을 적용한다 — 무관한 사례가 재료로 섞이면
    // 검수 팁이 "요구사항을 명확히 하라"류 일반론으로 수렴한다.
    const rows = await query<{ title: string; qna_summary: QnaSummary | null }>(
      `WITH raw AS MATERIALIZED (
         SELECT p.title, ai.qna_summary, 1 - (p.embedding <=> $1::vector) AS sim
           FROM projects p
           JOIN ai_insights ai ON ai.project_id = p.id
          WHERE p.embedding IS NOT NULL AND p.deleted_at IS NULL AND p.hidden = false
            AND ai.qna_summary IS NOT NULL ${scopeClause}
          ORDER BY p.embedding <=> $1::vector
          LIMIT $2
       )
       SELECT title, qna_summary FROM raw WHERE ${SIMILAR_CUTOFF} ORDER BY sim DESC`,
      params,
    );
    return rows.map((r) => ({
      title: r.title,
      riskSignals: r.qna_summary?.riskSignals ?? [],
      keyQuestions: r.qna_summary?.keyQuestions ?? [],
      technicalNotes: r.qna_summary?.technicalNotes ?? [],
      keywords: r.qna_summary?.keywords ?? [],
    }));
  }

  /**
   * 유사사례(L2) 집계 통계 코어 — 카드로 보여주는 상위 5~8건보다 큰 풀(SIMILAR_STATS_POOL)을
   * 표본 삼아 계약률·취소단계·모집기간·계약금액(dev_scope별)·제안건수·예산증감을 한 번의 왕복으로 계산한다.
   * pool은 MATERIALIZED로 고정 — 안 그러면 벡터 정렬(전체 테이블 스캔)이 하위 CTE마다 반복될 수 있다.
   */
  private async statsByVector(
    vec: string,
    excludeId?: string,
    filterScope?: string,
  ): Promise<SimilarStats> {
    const params: unknown[] = [vec];
    let where = "";
    if (excludeId) {
      params.push(excludeId);
      where += `p.id <> $${params.length} AND `;
    }
    if (filterScope) {
      params.push(filterScope);
      where += `p.dev_scope = $${params.length} AND `;
    }
    const [row] = await query<StatsRow>(
      `WITH raw AS MATERIALIZED (
         SELECT p.status, p.stage, p.cancel_stage, p.dev_scope, p.contract_amount, p.budget,
                p.recruit_started_at, p.progress_started_at, p.proposal_count,
                1 - (p.embedding <=> $1::vector) AS sim
           FROM projects p
          WHERE ${where}p.embedding IS NOT NULL AND p.deleted_at IS NULL AND p.hidden = false
          ORDER BY p.embedding <=> $1::vector
          LIMIT ${SIMILAR_STATS_POOL}
       ),
       -- 카드·검수 팁과 같은 유사도 하한. 표본이 줄면 poolSize가 줄고,
       -- SIMILAR_MIN_DECIDED 미만이 되면 계약률 등은 기존대로 숨겨진다.
       pool AS (SELECT * FROM raw WHERE ${SIMILAR_CUTOFF}),
       cancel_stage AS (
         SELECT cancel_stage AS label, count(*) AS decided,
                round(100.0 * count(*) / NULLIF(sum(count(*)) OVER (), 0), 1) AS rate
           FROM pool WHERE status = '완료(취소)' AND cancel_stage IS NOT NULL
          GROUP BY 1
       ),
       scope AS (
         SELECT dev_scope AS label, count(*) AS n,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY contract_amount) AS median,
                percentile_cont(0.25) WITHIN GROUP (ORDER BY contract_amount) AS q1,
                percentile_cont(0.75) WITHIN GROUP (ORDER BY contract_amount) AS q3
           FROM pool WHERE contract_amount > 0 AND dev_scope IS NOT NULL
          GROUP BY 1 HAVING count(*) >= ${SIMILAR_MIN_SCOPE}
          ORDER BY count(*) DESC
       ),
       proposals AS (
         SELECT CASE WHEN proposal_count = 0            THEN '0건'
                     WHEN proposal_count BETWEEN 1 AND 4   THEN '1~4건'
                     WHEN proposal_count BETWEEN 5 AND 9   THEN '5~9건'
                     WHEN proposal_count BETWEEN 10 AND 19 THEN '10~19건'
                     ELSE '20건 이상' END AS label,
                count(*) AS n, min(proposal_count) AS sort_key
           FROM pool WHERE proposal_count IS NOT NULL
          GROUP BY 1
       )
       SELECT
         (SELECT count(*) FROM pool) AS pool_size,
         (SELECT count(*) FILTER (WHERE ${DECIDED}) FROM pool) AS decided,
         (SELECT count(*) FILTER (WHERE ${WON}) FROM pool) AS contracted,
         (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(DAY FROM progress_started_at - recruit_started_at)) FROM pool) AS recruiting_days,
         (SELECT count(*) FROM pool WHERE recruit_started_at IS NOT NULL AND progress_started_at IS NOT NULL) AS recruiting_sample,
         (SELECT count(*) FROM pool WHERE contract_amount > 0 AND budget > 0 AND contract_amount > budget) AS budget_increased,
         (SELECT count(*) FROM pool WHERE contract_amount > 0 AND budget > 0 AND contract_amount = budget) AS budget_same,
         (SELECT count(*) FROM pool WHERE contract_amount > 0 AND budget > 0 AND contract_amount < budget) AS budget_decreased,
         (SELECT count(*) FROM pool WHERE contract_amount > 0 AND budget > 0) AS budget_sample,
         (SELECT json_agg(cancel_stage) FROM cancel_stage) AS cancel_by_stage,
         (SELECT json_agg(scope) FROM scope) AS contract_by_scope,
         (SELECT json_agg(proposals) FROM proposals) AS proposal_buckets`,
      params,
    );
    return toSimilarStats(row);
  }

  /** 상세보기 유사사례 집계 통계 — 기준 프로젝트의 저장된 임베딩으로 통계 풀을 찾는다. */
  async getSimilarStats(id: string): Promise<SimilarStats> {
    if (!/^\d+$/.test(id)) return EMPTY_SIMILAR_STATS;
    const base = await query<{ embedding: string | null }>(
      "SELECT embedding::text AS embedding FROM projects WHERE id = $1",
      [id],
    );
    const vec = base[0]?.embedding;
    if (!vec) return EMPTY_SIMILAR_STATS;
    return this.statsByVector(vec, id);
  }

  /**
   * 공고문 붙여넣기 검색 집계 통계 — 즉석 임베딩한 벡터로 통계 풀을 찾는다.
   * scope(유저가 고른 업무범위)가 있으면 그 dev_scope 사례만 하드 필터한다.
   */
  async searchSimilarStats(vector: number[], scope?: string): Promise<SimilarStats> {
    return this.statsByVector(`[${vector.join(",")}]`, undefined, scope);
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
