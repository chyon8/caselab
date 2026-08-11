// 개인별 관심 프로젝트 — CaseLab 자체 테이블(migrations/017_favorite.sql).

import { query } from "./db";

/**
 * 내 관심 프로젝트 id 목록.
 * BIGINT는 neon 드라이버가 문자열로 돌려주는데, 화면·API의 project id도 문자열이라 그대로 맞춘다.
 */
export async function listFavorites(email: string): Promise<string[]> {
  const rows = await query<{ project_id: string }>(
    `SELECT project_id FROM favorite WHERE manager_email = $1`,
    [email],
  );
  return rows.map((r) => String(r.project_id));
}

/** 관심 등록/해제 — 이미 그 상태여도 그냥 성공으로 둔다(별표를 빠르게 두 번 눌러도 안전) */
export async function setFavorite(email: string, projectId: string, on: boolean): Promise<void> {
  if (on) {
    await query(
      `INSERT INTO favorite (manager_email, project_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [email, projectId],
    );
  } else {
    await query(`DELETE FROM favorite WHERE manager_email = $1 AND project_id = $2`, [
      email,
      projectId,
    ]);
  }
}
