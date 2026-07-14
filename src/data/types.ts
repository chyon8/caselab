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
}

export interface IssueLogEntry {
  type: IssueType;
  date: string;
  src: string;
  text: string;
}

export interface QnaItem {
  q: string;
  by: string;
  at: string;
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
  submittedAt: string;
  /** 본진 최종 수정일 기준 경과일 — "언제 들어온 건"이 아니다 */
  daysAgo: number;
  /** 검수 시작(date_submitted) 후 경과일 — 기간 필터의 기준. 검수 기록이 없으면 null */
  submittedDaysAgo?: number | null;
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
  qna: QnaItem[];
  timeline: TimelineEvent[];
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
