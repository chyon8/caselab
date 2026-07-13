/** 배치 최대 건수 (DATA_INTEGRATION.md §5) */
export const MAX_BATCH = 500;

/**
 * n8n → CaseLab 요청 인증. 통과하면 null, 실패하면 그대로 반환할 응답을 돌려준다.
 */
export function requireSyncKey(req: Request): Response | null {
  const expected = process.env.CASELAB_SYNC_KEY;
  if (!expected) {
    return Response.json(
      { error: "CASELAB_SYNC_KEY가 서버에 설정되지 않았습니다." },
      { status: 500 },
    );
  }
  if (req.headers.get("x-caselab-key") !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
