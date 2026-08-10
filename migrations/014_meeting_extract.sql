-- 사전 미팅 녹취 AI 추출 (2026-08-10)
--
-- meetings.summary 는 통화 API 가 주는 서술형 한 문단(평균 226자)이라 "무슨 프로젝트인가"는
-- 알려주지만 "무엇이 정해졌고 무엇이 남았나"에 답하지 못한다. qna_summary 와 같은 방식으로
-- 고정 스키마 추출을 붙인다 — 자유 텍스트 요약과 달리 SQL 로 집계되고 화면에서 항목별로 읽힌다.
--
-- 저장 위치가 ai_insights 가 아니라 meetings 컬럼인 이유: 추출 단위가 프로젝트가 아니라
-- 미팅 1건이다(한 프로젝트에 개발사별 미팅이 최대 5건). ai_insights 는 project_id 유니크라
-- 여러 건을 담을 수 없다.
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS ai_extract JSONB;
