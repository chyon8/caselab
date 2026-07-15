/** 파이프라인 상태 (본진 status → CaseLab 표시 단계) */
export type ProjectStatus =
  | "검수"
  | "모집"
  | "계약"
  | "진행"
  | "완료(성공)"
  | "완료(취소)";

/** 이슈 로그 분류 태그 */
export type IssueType =
  | "이슈"
  | "과업 범위"
  | "예산 언급"
  | "일정"
  | "법무·보안"
  | "합의";

export interface TranscriptLine {
  t: string;
  who: string;
  text: string;
}

/** 개발사 모집 공고 원문 */
export interface Posting {
  title: string;
  background: string;
  scopeSummary: string[];
  featureGroups: { heading: string; items: string[] }[];
  nonFunctional: string[];
  techStack: string[];
  schedule: { start: string; milestones: string[]; due: string };
  qualRequired: string[];
  qualPreferred: string[];
  deliverables: string[];
}

/** 검수 확인 콜 / 미팅 녹취 (AI 요약 + 전체 녹취록) */
export interface CallRecord {
  title: string;
  date: string;
  summary: string[];
  lines: TranscriptLine[];
  /** 통화 API STT 원문 (통짜 텍스트). 구조화된 lines 와는 별개. mock 은 lines, 실데이터는 transcript. */
  transcript?: string | null;
  /** 'client' | 'partner' — 누구와의 통화인지 */
  userType?: string | null;
  /** 'high' | 'medium' — 통화↔프로젝트 매칭 신뢰도 (low 는 적재 단계에서 걸러짐) */
  confidence?: string | null;
}

export interface IssueLogEntry {
  type: IssueType;
  date: string;
  src: string;
  text: string;
}

export interface QnaItem {
  q: string;
  /** 답글. 여러 개면 이어붙여서 온다. 아직 답이 없으면 null */
  a?: string | null;
  by: string;
  /** 작성일 (M-D) */
  at: string;
  /** 클라이언트에게만 보이던 비공개 문의 — 개발사 댓글의 88%가 여기 해당한다 */
  isPrivate?: boolean;
}

export interface TimelineEvent {
  stage: string;
  date: string;
  title: string;
  desc: string;
  cancel?: boolean;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  cat: string;
  tech: string;
  budget: string;
  period: string;
  status: ProjectStatus;
  /** 1 검수 · 2 모집 · 3 계약 · 4 진행 · 5 완료 */
  stage: 1 | 2 | 3 | 4 | 5;
  manager: string;
  updated: string;
  /** 클라이언트가 검수를 요청한 날 (date_submitted) */
  submittedAt: string;
  /**
   * 매니저가 검수를 끝내고 모집으로 넘긴 날 (date_start_recruitment).
   * **목록의 정렬·표시·필터가 전부 이 날짜 기준이다** — 첫 화면의 목적이
   * "오늘 뭐 검수했지?"이기 때문. 백필 범위상 모든 프로젝트가 이미 모집 전환됐으므로
   * 이 값은 항상 존재한다 (검수 중인 프로젝트는 CaseLab에 들어오지 않는다).
   */
  reviewedAt: string;
  /** 본진 최종 수정일 기준 경과일 — "언제 들어온 건"이 아니다 */
  daysAgo: number;
  /** 검수 완료 후 경과일 — 기간 필터의 기준 */
  reviewedDaysAgo?: number | null;
  /** 단계별 소요일. 아직 그 단계에 도달하지 않았거나 원본 날짜가 없으면 null */
  durations?: {
    /** 검수 시작 → 모집 전환 */
    inspection: number | null;
    /** 모집 전환 → 진행 착수 (계약 협상 포함) */
    recruiting: number | null;
    /** 진행 착수 → 완료 */
    progress: number | null;
    /** 검수 시작 → 완료 또는 취소 */
    total: number | null;
  };
  contractAmount: string | null;
  contractPeriod: string | null;
  /** 계약 어드민 링크용 — 프로젝트 id와 다른 PK. 계약 전이면 null */
  agreementId?: string | null;
  /** 개발 범위 — 개발·디자인·기획 등 복수 선택 */
  devScope?: string[];
  isTurnkey?: boolean | null;
  /** 보유 기획 자료 수준 — idea | detail | document */
  planningStatus?: string | null;
  /** 지원 개발사 수 (모집 퍼널 1단) */
  proposalCount?: number | null;
  cancel?: { stage: string; reason: string };
  /** 리포트가 목록 전체를 집계하므로 목록에도 싣는다 (문자열 몇 개라 가볍다) */
  riskTags: string[];
}

/**
 * 상세 페이지 전용. 공고문·타임라인·Q&A는 **목록에 실으면 안 된다.**
 * 내용이 비어 있어도 빈 껍데기 구조만으로 프로젝트당 ~800바이트라,
 * 6천 건이면 5MB가 브라우저로 넘어간다 (posting의 빈 배열 9개 + call + qna + timeline).
 */
export interface ProjectFull extends Project {
  intake: { posting: Posting; call: CallRecord };
  issueLog: IssueLogEntry[];
  meeting?: CallRecord;
  /** 통화 녹취 목록 — 본진 통화 API. 한 프로젝트에 여러 건일 수 있다 (클라이언트·파트너 통화). */
  calls?: CallRecord[];
  qna: QnaItem[];
  timeline: TimelineEvent[];
}

/**
 * 리포트 집계. 전부 SQL에서 계산해 내려온다 —
 * Project의 budget·contractAmount는 화면용 문자열("4,500만원")이라 클라이언트에서 못 센다.
 *
 * ⚠️ 계약률의 분모는 **결판난 건**이다 (계약 도달 + 취소).
 *    아직 모집 중인 건은 결과가 안 나왔으므로 분모에서 뺀다 — 넣으면 계약률이 낮게 왜곡된다.
 */
export interface ReportStats {
  total: number;
  /** 계약 이상 도달 (계약·진행·완료) */
  contracted: number;
  cancelled: number;
  /** 아직 모집 중 — 계약률 계산에서 제외 */
  pending: number;
  contractRate: number;
  /** 취소가 터진 단계 분포 */
  cancelByStage: Breakdown[];
  byBudget: Breakdown[];
  byScope: Breakdown[];
  byProposals: Breakdown[];
  /** 단계별 소요일 중앙값 */
  medianDays: { inspection: number; recruiting: number; progress: number };
  /** 모집 예산 대비 실제 계약금액 */
  budgetDelta: { increased: number; same: number; decreased: number };
}

/** 리포트의 한 줄 — "1억+ : 결판 186건 중 계약률 14.5%" */
export interface Breakdown {
  label: string;
  /** 결판난 건수 (계약률의 분모) */
  decided: number;
  /** % */
  rate: number;
}

export interface AppNotification {
  id: string;
  type: "status" | "qna";
  projectId: string;
  text: string;
  time: string;
}

/** 완료 케이스 리뷰 (체크리스트 + 코멘트) */
export interface CaseReview {
  checks: boolean[];
  comment: string;
  savedAt: string;
}
