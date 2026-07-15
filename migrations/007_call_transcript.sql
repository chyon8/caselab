-- 007_call_transcript.sql — 통화 녹취 원문·화자유형 저장 (2026-07-15)
--
-- 기존 calls 는 summary 만 저장했다 (원문·전화번호는 안 받는 설계). 결정 변경:
-- 이슈/리스크/변경사항을 이슈로그로 추출하려면 요약(손실 압축)으론 부족하고 원문이 필요하다.
-- → 원문(transcript)까지 받아온다.
--
-- ⚠️ PII: 원문엔 이름·구두로 말한 번호가 남을 수 있다. n8n 에서 전화번호는 애초에 forward 안 하고,
--    수신 시 scrubPii(전화/이메일/주민번호)만 best-effort 적용된다. 이름은 못 잡는다 (알려진 한계).

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS transcript TEXT,
  ADD COLUMN IF NOT EXISTS user_type  TEXT;   -- 'client' | 'partner' — 누구와의 통화인지
