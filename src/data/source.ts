import { MOCK_NOTIFICATIONS, MOCK_PROJECTS, MOCK_REVIEWS } from "./mock-data";
import { PostgresDataSource } from "./postgres";
import type {
  AppNotification,
  CaseReview,
  Project,
  ProjectFull,
  ReportStats,
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

/**
 * 데이터 소스 어댑터 인터페이스.
 * CASELAB_DATA_SOURCE=postgres 이면 CaseLab DB(Neon)를, 아니면 Mock을 바라본다.
 * (CASELAB_DECISIONS.md §5 / DATA_INTEGRATION.md §9-4)
 */
export interface DataSource {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<ProjectFull | undefined>;
  getReportStats(): Promise<ReportStats>;
  getNotifications(): Promise<AppNotification[]>;
  getReviews(): Promise<Record<string, CaseReview>>;
  saveReview(projectId: string, review: CaseReview): Promise<void>;
}

class MockDataSource implements DataSource {
  private reviews: Record<string, CaseReview> = { ...MOCK_REVIEWS };

  async getProjects(): Promise<Project[]> {
    return MOCK_PROJECTS;
  }

  async getProject(id: string): Promise<ProjectFull | undefined> {
    return MOCK_PROJECTS.find((p) => p.id === id);
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
