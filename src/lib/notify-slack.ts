// Slack Incoming Webhook 알림. 실패해도 동기화 자체는 막지 않는다(best-effort, 조용히 무시).
// SLACK_WEBHOOK_URL 미설정 시 아무 일도 하지 않는다 — 로컬/테스트 환경에서 안전.
//
// ⚠️ 앱 기반 Incoming Webhook은 payload의 username/icon_url을 무시한다(레거시 webhook과 다름,
//   Slack이 앱 전환하며 제거한 기능). 아이콘을 바꾸려면 코드가 아니라 Slack 앱 설정
//   (api.slack.com/apps → 앱 선택 → Basic Information → Display Information → App icon)에서 해야 한다.

/** CASELAB_BASE_URL 미설정(로컬 등) 시 undefined — 도달 불가한 localhost를 Slack에 보내지 않는다 */
function baseUrl(): string | undefined {
  const base = process.env.CASELAB_BASE_URL;
  if (!base || base.includes("localhost")) return undefined;
  return base.replace(/\/$/, "");
}

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

/** 프로젝트 상세 링크 (원시 URL). CASELAB_BASE_URL 미설정 시 id만 표기 */
export function projectLink(id: string): string {
  const base = baseUrl();
  return base ? `${base}/projects/${id}` : `(project ${id})`;
}

/** Slack mrkdwn 하이퍼링크 — 프로젝트명 자체가 링크가 된다. 링크 불가 시 이름만 */
export function projectHyperlink(id: string, title: string): string {
  const base = baseUrl();
  return base ? `<${base}/projects/${id}|${title}>` : title;
}
