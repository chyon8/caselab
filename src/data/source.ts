import { matchesManager } from "@/lib/managers";
import type { PoolQna } from "@/lib/review-tips";
import { MOCK_NOTIFICATIONS, MOCK_PROJECTS, MOCK_REVIEWS } from "./mock-data";
import { DEFAULT_PAGE_SIZE, KANBAN_PAGE_SIZE, PostgresDataSource } from "./postgres";
import type {
  AppNotification,
  CaseReview,
  KanbanColumn,
  Project,
  ProjectFull,
  ProjectPage,
  ProjectQuery,
  ProjectStatus,
  ReportStats,
  SimilarProject,
  SimilarStats,
} from "./types";

/** Mock은 리포트 집계를 만들지 않는다 — 표본 14건으로는 비율이 무의미하다 */
const EMPTY_STATS: ReportStats = {
  total: 0,
  contracted: 0,
  cancelled: 0,
  pending: 0,
  contractRate: 0,
  cancelByStage: [],
  byBudget: [],
  byScope: [],
  byProposals: [],
  medianDays: { inspection: 0, recruiting: 0, progress: 0 },
  budgetDelta: { increased: 0, same: 0, decreased: 0 },
};

/** Mock은 임베딩이 없어 유사사례 통계도 만들지 않는다 */
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

/**
 * 데이터 소스 어댑터 인터페이스.
 * CASELAB_DATA_SOURCE=postgres 이면 CaseLab DB(Neon)를, 아니면 Mock을 바라본다.
 * (CASELAB_DECISIONS.md §5 / DATA_INTEGRATION.md §9-4)
 */
export interface DataSource {
  /** 목록 한 페이지 — 필터·검색·정렬·페이지네이션을 서버에서 처리한다(6천 건 통째 로드 금지) */
  getProjects(params: ProjectQuery): Promise<ProjectPage>;
  /** 칸반 — 상태별 상위 items + 총계. "더 보기"는 getProjects({status})로 이어 받는다 */
  getKanban(params: ProjectQuery): Promise<KanbanColumn[]>;
  getProject(id: string): Promise<ProjectFull | undefined>;
  /** 유사사례(L2) — 해당 프로젝트 공고문과 의미적으로 가까운 과거 프로젝트 상위 N건 */
  getSimilarProjects(id: string, limit?: number): Promise<SimilarProject[]>;
  /** 유사사례(L2) — 즉석 임베딩한 벡터(공고문 붙여넣기 검색)로 가까운 과거 프로젝트 상위 N건.
   *  scope(내 프로젝트 업무범위)를 주면 같은 dev_scope 사례를 소프트 부스트한다 */
  searchSimilarByVector(vector: number[], limit?: number, scope?: string): Promise<SimilarProject[]>;
  /** 유사사례(L2) 집계 통계 — 기준 프로젝트의 저장된 임베딩으로 통계 풀을 찾는다 */
  getSimilarStats(id: string): Promise<SimilarStats>;
  /** 유사사례(L2) 집계 통계 — 즉석 임베딩한 벡터(공고문 붙여넣기 검색)로 통계 풀을 찾는다 */
  searchSimilarStats(vector: number[]): Promise<SimilarStats>;
  /** 검수 팁 — 즉석 임베딩한 벡터로 유사 풀의 qna 요약(리스크·질문·키워드)을 가져온다 */
  searchSimilarQnaPool(vector: number[], limit?: number): Promise<PoolQna[]>;
  getReportStats(): Promise<ReportStats>;
  getNotifications(): Promise<AppNotification[]>;
  getReviews(): Promise<Record<string, CaseReview>>;
  saveReview(projectId: string, review: CaseReview): Promise<void>;
}

/** 칸반 컬럼 순서 — Mock 전용 (Postgres판은 postgres.ts에 있다) */
const KANBAN_ORDER: ProjectStatus[] = [
  "검수",
  "모집",
  "계약",
  "진행",
  "완료(성공)",
  "완료(취소)",
];

/** Mock 필터 — 서버(Postgres) 필터 로직의 클라이언트판. 본문이 없어 이름·고객사·카테고리·기술만 검색한다 */
function mockFilter(params: ProjectQuery): Project[] {
  const tokens = (params.q ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const starred = params.starredIds ? new Set(params.starredIds) : null;
  return MOCK_PROJECTS.filter((p) => {
    if (params.status && params.status !== "전체" && p.status !== params.status) return false;
    if (params.manager && !matchesManager(p.manager, params.manager)) return false;
    if (params.periodDays != null && Number.isFinite(params.periodDays)) {
      if (p.reviewedDaysAgo == null || p.reviewedDaysAgo > params.periodDays) return false;
    }
    if (starred && !starred.has(p.id)) return false;
    if (tokens.length) {
      const hay = `${p.name}${p.client}${p.cat}${p.tech}`.toLowerCase();
      if (!tokens.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}

class MockDataSource implements DataSource {
  private reviews: Record<string, CaseReview> = { ...MOCK_REVIEWS };

  async getProjects(params: ProjectQuery): Promise<ProjectPage> {
    const all = mockFilter(params);
    const page = Math.max(1, params.page ?? 1);
    const size = params.pageSize ?? DEFAULT_PAGE_SIZE;
    const start = (page - 1) * size;
    return { rows: all.slice(start, start + size), total: all.length };
  }

  async getKanban(params: ProjectQuery): Promise<KanbanColumn[]> {
    // 칸반은 상태 드롭다운을 무시한다(컬럼 자체가 상태)
    const all = mockFilter({ ...params, status: "전체" });
    return KANBAN_ORDER.map((status) => {
      const items = all.filter((p) => p.status === status);
      return { status, total: items.length, items: items.slice(0, KANBAN_PAGE_SIZE) };
    });
  }

  async getProject(id: string): Promise<ProjectFull | undefined> {
    return MOCK_PROJECTS.find((p) => p.id === id);
  }

  /** Mock은 임베딩이 없어 유사사례를 만들지 않는다 */
  async getSimilarProjects(): Promise<SimilarProject[]> {
    return [];
  }

  async searchSimilarByVector(): Promise<SimilarProject[]> {
    return [];
  }

  async getSimilarStats(): Promise<SimilarStats> {
    return EMPTY_SIMILAR_STATS;
  }

  async searchSimilarStats(): Promise<SimilarStats> {
    return EMPTY_SIMILAR_STATS;
  }

  async searchSimilarQnaPool(): Promise<PoolQna[]> {
    return [];
  }

  async getReportStats(): Promise<ReportStats> {
    return EMPTY_STATS;
  }

  async getNotifications(): Promise<AppNotification[]> {
    return MOCK_NOTIFICATIONS;
  }

  async getReviews(): Promise<Record<string, CaseReview>> {
    return this.reviews;
  }

  async saveReview(projectId: string, review: CaseReview): Promise<void> {
    this.reviews[projectId] = review;
  }
}

export const dataSource: DataSource =
  process.env.CASELAB_DATA_SOURCE === "postgres"
    ? new PostgresDataSource()
    : new MockDataSource();
