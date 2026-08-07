// 검수 세션 저장 — CaseLab 자체 테이블(migrations/013_review_session.sql).
// 녹취 원문은 안 받는다(요약만) — 스키마 파일의 설계 메모 참조.

// ⚠️ BIGSERIAL/BIGINT는 neon 드라이버가 **문자열**로 돌려준다("2"). 그대로 두면 화면이 그 문자열을
//    다시 id로 보내고, 라우트의 숫자 검사에 걸려 매 저장이 INSERT로 빠진다(덮어쓰기가 안 됨).
//    → 이 모듈에서 나가는 id는 전부 Number로 맞춘다.
import { query } from "./db";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth/session";

/** 고른 통화 중 저장하는 부분 */
export interface SessionCall {
  id: number;
  summary: string | null;
  created_at: string | null;
  project_title: string | null;
}

/** 저장 요청 본문 — analysis·draft는 화면 번들을 그대로 넣는다(형태는 화면이 안다) */
export interface SessionInput {
  id?: number;
  title: string | null;
  sourceText: string;
  analysis: unknown;
  draft: unknown;
  calls: SessionCall[];
}

/** 목록 한 줄 */
export interface SessionListItem {
  id: number;
  title: string | null;
  updated_at: string;
}

export interface SessionRow extends SessionListItem {
  source_text: string;
  analysis: unknown;
  draft: unknown;
  call_summaries: SessionCall[] | null;
}

/** 로그인 이메일 — 세션이 없으면 null(라우트가 401로 끊는다) */
export async function currentManagerEmail(): Promise<string | null> {
  const jar = await cookies();
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value);
  return session?.email ?? null;
}

/**
 * 저장 — id가 있으면 그 행을 덮어쓰고, 없으면 새로 만든다.
 * UPDATE에 manager_email 조건을 같이 거는 건 남의 세션 id를 넘겨 덮어쓰는 걸 막기 위해서다.
 */
export async function saveSession(email: string, input: SessionInput): Promise<number> {
  const callIds = input.calls.map((c) => c.id);
  const callSummaries = JSON.stringify(input.calls);
  const analysis = JSON.stringify(input.analysis ?? null);
  const draft = JSON.stringify(input.draft ?? null);

  if (input.id) {
    const rows = await query<{ id: number }>(
      `UPDATE review_session
          SET title = $1, source_text = $2, analysis = $3, call_ids = $4,
              call_summaries = $5, draft = $6, updated_at = now()
        WHERE id = $7 AND manager_email = $8
        RETURNING id`,
      [input.title, input.sourceText, analysis, callIds, callSummaries, draft, input.id, email],
    );
    if (rows[0]) return Number(rows[0].id);
    // 내 것이 아니거나 사라진 id — 새로 만든다(저장이 조용히 실패하는 것보다 낫다)
  }

  const rows = await query<{ id: number }>(
    `INSERT INTO review_session
       (title, manager_email, source_text, analysis, call_ids, call_summaries, draft)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [input.title, email, input.sourceText, analysis, callIds, callSummaries, draft],
  );
  return Number(rows[0].id);
}

/** 내 세션 목록 — 최근 순 */
export async function listSessions(email: string): Promise<SessionListItem[]> {
  const rows = await query<SessionListItem>(
    `SELECT id, title, updated_at
       FROM review_session
      WHERE manager_email = $1
      ORDER BY updated_at DESC
      LIMIT 50`,
    [email],
  );
  return rows.map((r) => ({ ...r, id: Number(r.id) }));
}

/** 세션 한 건 — 내 것만 */
export async function getSession(email: string, id: number): Promise<SessionRow | null> {
  const rows = await query<SessionRow>(
    `SELECT id, title, updated_at, source_text, analysis, draft, call_summaries
       FROM review_session
      WHERE id = $1 AND manager_email = $2`,
    [id, email],
  );
  return rows[0] ? { ...rows[0], id: Number(rows[0].id) } : null;
}

/** 세션 삭제 — 내 것만 */
export async function deleteSession(email: string, id: number): Promise<void> {
  await query(`DELETE FROM review_session WHERE id = $1 AND manager_email = $2`, [id, email]);
}
