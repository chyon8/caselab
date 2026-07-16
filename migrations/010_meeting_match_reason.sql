-- 010_meeting_match_reason.sql — 미팅↔프로젝트 매칭 근거 (2026-07-16)
--
-- /api/meetings/ 단건 응답의 match_reason(문자열) — "이 회의록이 왜 이 project_id로
-- 매칭됐는가"를 AI가 설명한 텍스트다. 검수 매니저가 매칭 신뢰도를 판단할 근거라 저장한다.
-- (confidence·agreement_id 도 응답에 있으나 지금은 안 가져온다.)

ALTER TABLE meetings ADD COLUMN IF NOT EXISTS match_reason TEXT;
