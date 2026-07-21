// Slack Incoming Webhook 알림. 실패해도 동기화 자체는 막지 않는다(best-effort, 조용히 무시).
// SLACK_WEBHOOK_URL 미설정 시 아무 일도 하지 않는다 — 로컬/테스트 환경에서 안전.

export async function notifySlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    // 알림 실패는 무시 — 동기화 성공이 우선이다
  }
}

/** 알림 메시지에 붙일 프로젝트 상세 링크. CASELAB_BASE_URL 미설정 시 id만 표기 */
export function projectLink(id: string): string {
  const base = process.env.CASELAB_BASE_URL;
  return base ? `${base.replace(/\/$/, "")}/projects/${id}` : `(project ${id})`;
}
