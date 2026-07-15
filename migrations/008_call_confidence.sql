-- 008_call_confidence.sql — 통화↔프로젝트 매칭 신뢰도 저장 (2026-07-15)
--
-- 통화 API가 전화번호로 통화를 찾을 때 project_id 를 스스로 추정하고 그 신뢰도를
-- confidence(high/medium/low)로 돌려준다. low 는 API가 자신 없이 추측한 매핑이라
-- 이슈로그를 오염시킬 수 있다 → 동기화 스크립트에서 low 는 애초에 버린다(POST 안 함).
-- 저장되는 high/medium 도 화면에서 참고할 수 있도록 컬럼으로 남긴다.

ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS confidence TEXT;   -- 'high' | 'medium'  (low 는 적재 안 함)
