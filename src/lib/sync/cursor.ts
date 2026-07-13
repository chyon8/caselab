/**
 * 복합 커서 "ts|id" (DATA_INTEGRATION.md §5).
 * 같은 date_modified를 가진 행이 배치 경계에 걸릴 때 행을 놓치지 않기 위함.
 *
 * ts는 n8n이 보낸 문자열을 그대로 보관한다. 이 값이 본진 MySQL 쿼리로
 * 되돌아가므로, 중간에 파싱·재포맷해서 타임존이 흔들리면 안 된다.
 */
export function formatCursor(ts: string, id: string | number): string {
  return `${ts}|${id}`;
}

export function parseCursor(value: string): { ts: string; id: string } | null {
  const i = value.lastIndexOf("|");
  if (i < 0) return null;
  return { ts: value.slice(0, i), id: value.slice(i + 1) };
}

function compare(aTs: string, aId: string | number, bTs: string, bId: string | number): number {
  if (aTs !== bTs) return aTs > bTs ? 1 : -1;
  const an = Number(aId);
  const bn = Number(bId);
  // id는 숫자다 — 문자열로 비교하면 "9" > "10"이 되어 커서가 앞질러 간다
  if (Number.isFinite(an) && Number.isFinite(bn)) return an === bn ? 0 : an > bn ? 1 : -1;
  const as = String(aId);
  const bs = String(bId);
  return as === bs ? 0 : as > bs ? 1 : -1;
}

/**
 * 배치에서 (ts, id) 기준 최댓값 행. n8n이 ASC로 보내지만 순서가 흔들려도
 * 커서가 앞질러 가서 행을 건너뛰는 일이 없도록 최댓값을 직접 구한다.
 */
export function maxByCursor<T>(
  rows: T[],
  ts: (r: T) => string,
  id: (r: T) => string | number,
): T {
  return rows.reduce((max, r) => (compare(ts(r), id(r), ts(max), id(max)) > 0 ? r : max));
}
