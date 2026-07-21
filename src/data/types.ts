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
  /** 미팅 전용 — 회의록이 이 프로젝트로 매칭된 AI 근거 (match_reason) */
  matchReason?: string | null;
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

/** 개발사 Q&A를 AI로 정리한 요약 — 노이즈(세일즈·자기소개) 제거 후 핵심만 */
export interface QnaSummary {
  keyQuestions: string[];
  decisions: string[];
  riskSignals: string[];
  /**
   * 기술적 제약·실현가능성 지적·대안 구현 제안. 개발사가 "이건 이래서 이렇게 안 된다"고
   * 근거를 대며 짚은 내용 — 검수에서 가장 값진 재료다.
   *
   * 이 필드가 없던 시절엔 갈 곳이 없어서 keyQuestions로 밀려 들어갔고, 그 과정에서 근거가
   * 잘려나갔다. 실례(148661): "30~60초 영상은 현재 API로 고정 아바타 모델 외엔 불가, 이어붙이면
   * 토큰 소모 큼"이라는 지적이 "이어붙이는 형태인지?"라는 맹탕 질문으로 남았다.
   *
   * 이 필드가 추가되기 전에 추출된 요약에는 없다(undefined).
   */
  technicalNotes?: string[];
  keywords: string[];
  noiseDropped: number;
  /** 요약 생성 시점의 Q&A 스레드 수. 이후 이 수가 늘면 cron이 재분석한다(개수 변화 트리거). 구버전 요약엔 없다. */
  sourceCount?: number;
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
  /** 모집 단계에서 사전 미팅이 시작됨 — 목록·칸반에서 '미팅중'으로 분리 표시 (status는 여전히 '모집') */
  meetingActive?: boolean;
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
  /** 모집 전환일 연도 포함 "2026-07-02" — 상세 화면 표시용(reviewedAt은 연도 없는 MM-DD) */
  reviewedAtFull?: string;
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

/** 목록/칸반 서버 조회 파라미터 — 필터·검색·페이지네이션을 전부 서버에서 처리한다 */
export interface ProjectQuery {
  /** 검색어 — 공백 토큰 간 AND, 필드(제목·본문·고객사·기술·카테고리) 간 OR */
  q?: string;
  /** "전체" 또는 특정 상태. 칸반에서는 무시된다(컬럼 자체가 상태라서) */
  status?: string;
  /** 필터 드롭다운 값 — 실명 / "그 외" / "전체" */
  manager?: string;
  /** 검수완료일(모집 전환일) 기준 최근 N일. null/undefined = 기간 전체 */
  periodDays?: number | null;
  /** ★관심 필터가 켜졌을 때만 전달. []는 "켜졌으나 관심 없음" = 결과 없음 */
  starredIds?: string[];
  /** 1-based */
  page?: number;
  pageSize?: number;
}

/** 목록 한 페이지 — total은 필터 적용 후 전체 건수(페이지네이션용) */
export interface ProjectPage {
  rows: Project[];
  total: number;
}

/** 칸반/필터에서 모집을 사전 미팅 진행 여부로 쪼갠 파생 상태 ('미팅중'은 status='모집'의 부분집합) */
export type KanbanStatus = ProjectStatus | "미팅중";

/** 칸반 컬럼 — 상위 items + 그 상태의 전체 건수 */
export interface KanbanColumn {
  status: KanbanStatus;
  total: number;
  items: Project[];
}

/**
 * 상세 페이지 전용. 공고문·타임라인·Q&A는 **목록에 실으면 안 된다.**
 * 내용이 비어 있어도 빈 껍데기 구조만으로 프로젝트당 ~800바이트라,
 * 6천 건이면 5MB가 브라우저로 넘어간다 (posting의 빈 배열 9개 + call + qna + timeline).
 */
export interface ProjectFull extends Project {
  intake: { posting: Posting; call: CallRecord };
  issueLog: IssueLogEntry[];
  /** 사전 미팅 녹취록 — 통화 API /api/meetings/. 개발사별로 한 프로젝트에 여러 건일 수 있다. */
  meetings?: CallRecord[];
  /** 통화 녹취 목록 — 본진 통화 API by-phone. 한 프로젝트에 여러 건일 수 있다 (클라이언트·파트너 통화). */
  calls?: CallRecord[];
  qna: QnaItem[];
  /** 개발사 Q&A AI 요약 — 아직 추출 전이면 undefined */
  qnaSummary?: QnaSummary;
  timeline: TimelineEvent[];
}

/** 유사사례(L2) — 공고문 임베딩 코사인 유사도로 찾은 과거 프로젝트 */
export interface SimilarProject extends Project {
  /** 코사인 유사도 0~1 (1에 가까울수록 유사) */
  similarity: number;
}

/** 단순 분포 한 줄 — "1~4건 : 10건 (32.3%)". Breakdown과 달리 결판(decided) 개념이 없다 */
export interface Bucket {
  label: string;
  count: number;
  /** % — 전체 표본(poolSize) 대비 */
  rate: number;
}

/** dev_scope 조합별 계약금액 중앙값·사분위수. 금액 성격이 combo마다 달라 반드시 분리해서 본다 */
export interface ScopeAmount {
  label: string;
  count: number;
  median: string;
  q1: string;
  q3: string;
}

/**
 * 유사사례(L2) 풀 집계 통계 — 개별 카드 나열 대신 상위 유사사례 묶음의 경향을 본다.
 * 표본이 작으면(SIMILAR_MIN_DECIDED 미만) 해당 지표는 null/빈 배열로 내려온다 — 화면에서 숨긴다.
 */
export interface SimilarStats {
  /** 통계에 포함된 유사사례 표본 크기 */
  poolSize: number;
  /** 결판난 건수(계약률의 분모) */
  decided: number;
  contractRate: number | null;
  cancelByStage: Breakdown[];
  /** 모집 기간(모집 시작→진행 착수) 중앙값, 일 */
  recruitingDaysMedian: number | null;
  contractByScope: ScopeAmount[];
  proposalBuckets: Bucket[];
  budgetDelta: { increased: number; same: number; decreased: number } | null;
}

/** 검수 팁 한 줄. 원본 나열이면 freq 생략, 빈도/AI 집계면 freq(지지 사례 수)를 채운다 */
export interface ReviewTip {
  text: string;
  freq?: number;
}

/**
 * 검수 팁 — 유사사례 풀의 qna_summary(리스크·질문·키워드)를 합친 정성 인사이트.
 * SimilarStats(숫자)의 텍스트 짝. 집계 방식(원본 나열 / AI 재요약)이 바뀌어도
 * 이 형태로만 내려오면 화면은 그대로다 — UI를 먼저 이 계약에 고정한다.
 */
export interface ReviewTips {
  /** 팁 산출에 실제로 쓴 사례 수 (qna_summary가 있는 것만) */
  sampleSize: number;
  /** 기술적 제약·실현가능성·대안 구현 — 근거가 실린 재료라 가장 값지다 (화면 최상단) */
  technicalNotes: ReviewTip[];
  risks: ReviewTip[];
  questions: ReviewTip[];
  keywords: { term: string; count: number }[];
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
