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
  daysAgo: number;
  contractAmount: string | null;
  contractPeriod: string | null;
  /** 계약 어드민 링크용 — 프로젝트 id와 다른 PK. 계약 전이면 null */
  agreementId?: string | null;
  cancel?: { stage: string; reason: string };
  intake: { posting: Posting; call: CallRecord };
  issueLog: IssueLogEntry[];
  riskTags: string[];
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
