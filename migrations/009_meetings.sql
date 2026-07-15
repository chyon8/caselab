-- 009_meetings.sql — 개발사 사전 미팅 녹취 (2026-07-15)
--
-- 통화 녹취(calls, by-phone)와는 별개 데이터다. 통화 API 의 /api/meetings/ 가
-- project_id 로 직접 매칭해 3자(매니저·클라·파트너) 전문을 준다 (by-phone 처럼
-- 전화번호로 추측하지 않으므로 confidence·오매핑 문제가 없다).
-- → 사전 미팅 녹취록(p.meetings) 을 채운다. 한 프로젝트에 개발사별로 여러 건일 수 있다.
--
-- ⚠️ PII: member_name(우리 매니저명)·전화번호는 n8n 에서 애초에 forward 하지 않는다.
--    summary·transcript 는 수신 시 scrubPii(전화/이메일/주민번호) 통과. 이름은 못 잡음(알려진 한계).

CREATE TABLE IF NOT EXISTS meetings (
  id           BIGINT PRIMARY KEY,   -- /api/meetings/ 의 미팅 id
  project_id   BIGINT REFERENCES projects(id),
  partner_slug TEXT,                 -- 어느 개발사와의 미팅인지 (izensoft, dxplayground …)
  summary      TEXT,                 -- 통화 API 제공 요약 (별도 LLM 비용 0)
  transcript   TEXT,                 -- "[MM:SS] 역할: 발화" 형식 전문 (## 요약 + ## 전문 포함)
  created_at   TIMESTAMPTZ           -- 미팅일 (자정 — 하루 단위 정밀도)
);
CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings (project_id, created_at);
