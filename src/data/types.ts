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
  /** 미팅 전용 — 녹취 AI 추출. 아직 추출 전이면 undefined */
  aiExtract?: MeetingExtract;
}

/**
 * 사전 미팅 녹취를 AI로 추출한 결과 — 통화 API가 주는 서술형 summary(평균 226자)가
 * "무슨 프로젝트인가"엔 답해도 "무엇이 정해졌고 무엇이 남았나"엔 답하지 못해 따로 뽑는다.
 * qna_summary와 같은 원칙(요약 아니라 고정 스키마 추출).
 */
export interface MeetingExtract {
  /** 미팅에서 확정·합의된 사항. "검토해보겠다"류는 여기가 아니라 openIssues로 간다 */
  decisions: string[];
  /** 기술적 제약·실현가능성 지적·대안 제안 — 근거를 살린 서술형 */
  technicalNotes: string[];
  riskSignals: string[];
  /** 아직 안 정해진 쟁점 / 다음에 확인할 것 */
  openIssues: string[];
  /** "주체: 할 일" 형식. 3자 미팅에만 있는 신호라 qna 요약엔 대응 필드가 없다 */
  followUps: string[];
  /** 추출 시점의 녹취 길이. 녹취가 갱신되면 길이가 달라져 재추출 대상이 된다 */
  sourceLen?: number;
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

/**
 * 매니저 내부 노트를 프로젝트 단위로 추출한 결과 — "핸드오프 후 무슨 일이 있었나".
 *
 * 노트 1건은 평균 131자짜리 단편이라 혼자서는 뜻이 안 통한다. 시간순으로 묶어야
 * "왜 취소됐나 / 무엇이 바뀌었나"가 나오므로 추출 단위가 프로젝트다.
 * 실물의 60~70%는 미팅 일정 조율·발송 문구 원문이라 noiseDropped로 세어 버린다.
 */
export interface ManagenoteExtract {
  /** 계약·취소·보류 결정과 그 이유 */
  outcome: string[];
  /** 통화·미팅에서 드러난, 공고에는 없던 클라이언트 조건 */
  clientRequirements: string[];
  /** 금액·과업·일정이 바뀐 것 (전후 포함) */
  scopeChanges: string[];
  /** 파트너 평가·점수·탈락 사유 */
  partnerFeedback: string[];
  riskSignals: string[];
  /** 위 다섯 어디에도 안 맞지만 알아둘 것. 집계는 안 되고 읽기용이다 */
  otherNotes: string[];
  noiseDropped: number;
  /** 추출 시점의 노트 수. 이후 늘면 재추출 대상이 된다 (qna_summary의 sourceCount와 같은 역할) */
  sourceCount: number;
}

/** 매니저 내부 노트 원문 한 건 — 요약 아래 접힌 섹션에서만 쓴다 */
export interface ManagerNote {
  /** 'M-D' */
  at: string;
  /** '일반' | '공지' */
  kind: string;
  by: string;
  body: string;
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
  /** 매니저 내부 노트 AI 추출 — 아직 추출 전이면 undefined */
  noteExtract?: ManagenoteExtract;
  /** 매니저 내부 노트 원문(시간순). 타임라인에는 넣지 않는다 — 72%가 일정 조율·발송 기록이다 */
  notes: ManagerNote[];
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
  /**
   * 이 구간에서 아직 결판 안 난 비율(%).
   * 최근 구간을 보면 이 값이 커진다 — 계약률이 표본의 일부만 반영한다는 경고에 쓴다.
   */
  pendingRate: number;
  /** 이 구간에 실제로 담긴 모집 전환일 범위 (ISO). 화면 캡션을 하드코딩하지 않으려고 DB에서 받는다 */
  coverage: { from: string | null; to: string | null };
  /** 계약금액 중앙값(원). 0원 건 제외 — "전형적인 건"이 얼마인지 */
  contractMedian: number | null;
  /** 계약금액 평균(원). 0원 건 제외 — 중앙값과 크게 벌어지면 소수 대형 건이 평균을 끌어올린다는 신호 */
  contractMean: number | null;
  /** 계약금액 구간별 분포(계약까지 간 건, 0원 제외) — rate는 이 구간의 구성비 */
  contractByAmount: Breakdown[];
  byBudget: Breakdown[];
  byScope: Breakdown[];
  byProposals: Breakdown[];
  /** 지원 1~5건 구간을 1건 단위로 쪼갠 계약률. byProposals의 '1~4건' 버킷이 감추는 차이를 본다 */
  byLowProposals: Breakdown[];
  /** 모집 전환 월(KST)별 계약률. 최근 순으로 최대 MONTHS_LIMIT개월 */
  byMonth: Breakdown[];
  /** 임베딩 클러스터(유형)별 계약률. 클러스터 미구축이면 빈 배열 */
  byCluster: Breakdown[];
  /**
   * Q&A에서 뽑힌 리스크 태그 빈도 Top N.
   * decided = 그 태그가 붙은 프로젝트 수, rate = 리스크가 하나라도 있는 프로젝트 대비 %.
   * 한 프로젝트에 태그가 여러 개 붙으므로 rate 합은 100%를 넘는다.
   */
  topRisks: Breakdown[];
  /** 리스크 태그가 하나라도 붙은 프로젝트 수 — topRisks rate의 분모 */
  riskTagged: number;
  /** 단계별 소요일 중앙값. cancelled = 모집 → 취소 (결과가 반대인 건을 따로 본다) */
  medianDays: { inspection: number; recruiting: number; progress: number; cancelled: number };
  /** 모집 예산 대비 실제 계약금액. zeroExcluded = 계약금액 0원이라 뺀 건수 */
  budgetDelta: { increased: number; same: number; decreased: number; zeroExcluded: number };
}

/** 리포트의 한 줄 — "1억+ : 결판 186건 중 계약률 14.5%" */
export interface Breakdown {
  label: string;
  /** 결판난 건수 (계약률의 분모) */
  decided: number;
  /** % */
  rate: number;
  /** 표본이 적어 비율이 우연에 흔들리는 구간 — 화면에서 흐리게 + 배지 */
  lowSample?: boolean;
}

/**
 * 검수 매니저 한 명의 성과 지표. 리포트의 다른 집계와 달리 **사람**이 단위라
 * 아무에게나 보이면 안 된다 — 조회 자체를 권한 있는 계정에서만 한다(report/page.tsx).
 */
export interface ManagerStat {
  /** 실명(매핑 없으면 계정명 그대로) */
  manager: string;
  /** 담당 건수 — 모집 중 포함 */
  total: number;
  /** 결판난 건수 (계약률의 분모) */
  decided: number;
  contractRate: number;
  /** 취소율 = 취소 / 결판 */
  cancelRate: number;
  /** 계약금액 중앙값(원, 0원 제외) */
  contractMedian: number | null;
  /** 모집 → 진행 착수 중앙값(일) */
  recruitingDays: number | null;
  /** 아직 모집 중 */
  pending: number;
  /**
   * 결판난 건이 적어 비율이 우연에 흔들리는 매니저 — 숨기지 않고 표시만 흐리게 한다.
   * 다른 섹션과 달리 여기서 행을 빼면 "그 사람 담당 건은 없다"로 읽혀 더 나쁘다.
   */
  lowSample: boolean;
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
