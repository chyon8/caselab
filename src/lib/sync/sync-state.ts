import { query } from "@/lib/db";

/** sync_state 테이블 = 소스별 동기화 커서의 단일 진실 (DATA_INTEGRATION.md §5) */

export async function readCursor(source: string): Promise<string | null> {
  const rows = await query<{ cursor_value: string | null }>(
    "SELECT cursor_value FROM sync_state WHERE source = $1",
    [source],
  );
  return rows[0]?.cursor_value ?? null;
}

/** 배치 처리가 모두 성공한 뒤에만 호출한다 (실패 시 다음 주기에 같은 배치 재시도) */
export async function saveCursor(source: string, cursor: string): Promise<void> {
  await query(
    `INSERT INTO sync_state (source, cursor_value, last_run_at)
     VALUES ($1, $2, now())
     ON CONFLICT (source) DO UPDATE
       SET cursor_value = EXCLUDED.cursor_value, last_run_at = now()`,
    [source, cursor],
  );
}
