/**
 * 검수통화 녹취 조회 — n8n 프록시 웹훅이 돌려주는 통화 한 건.
 *
 * 원천은 통화 API `GET /api/calls/by-phone/`(DATA_SCHEMA §8-3). 필드는 그 응답의 `type="phone"`
 * 결과 객체에서 **화면에 필요한 것만** 추린 것 — 고객 전화번호(`phone`)·상담원명(`member_name`)은
 * n8n 에서 잘라내고 브라우저까지 오지 않는다(기존 파이프라인과 같은 PII 원칙).
 *
 * CaseLab 서버(Vercel)는 이 조회에 관여하지 않는다. 스펙: n8n/calls_proxy_pipeline.md
 */
export interface CallRecord {
  id: number;
  project_id: number | null;
  project_title: string | null;
  /** in(수신) | out(발신) */
  call_type: string | null;
  /** 통화 길이(초) */
  call_time_secs: number | null;
  summary: string | null;
  transcript: string | null;
  drive_url: string | null;
  /** "2026-04-07 13:55:33" — 타임존 표기 없는 KST 문자열 */
  created_at: string | null;
}
