import { MOCK_NOTIFICATIONS, MOCK_PROJECTS, MOCK_REVIEWS } from "./mock-data";
import type { AppNotification, CaseReview, Project } from "./types";

/**
 * 데이터 소스 어댑터 인터페이스.
 * 지금은 Mock 구현만 존재하며, 실주소(n8n 웹훅 등)가 확정되면
 * 같은 인터페이스의 어댑터로 교체한다. (CASELAB_DECISIONS.md §5)
 */
export interface DataSource {
  getProjects(): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  getNotifications(): Promise<AppNotification[]>;
  getReviews(): Promise<Record<string, CaseReview>>;
  saveReview(projectId: string, review: CaseReview): Promise<void>;
}

class MockDataSource implements DataSource {
  private reviews: Record<string, CaseReview> = { ...MOCK_REVIEWS };

  async getProjects(): Promise<Project[]> {
    return MOCK_PROJECTS;
  }

  async getProject(id: string): Promise<Project | undefined> {
    return MOCK_PROJECTS.find((p) => p.id === id);
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

export const dataSource: DataSource = new MockDataSource();
