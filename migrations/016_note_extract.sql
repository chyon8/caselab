-- 매니저 노트 AI 추출 (2026-08-10)
--
-- 추출 단위가 노트 1건이 아니라 프로젝트다 — 노트는 건당 평균 131자짜리 단편이라
-- 한 건만 보면 뜻이 안 통하고, 시간순으로 20여 건을 이어 붙여야 "무슨 일이 있었나"가 나온다.
-- 그래서 프로젝트당 1행인 ai_insights 에 둔다 (미팅 추출이 meetings 컬럼인 것과 반대).
--
-- ⚠️ 기존 issue_log 컬럼을 재사용하지 않는 이유: 그 컬럼은 {type,date,src,text} 엔트리 배열을
--    가정하고 만들어졌고 UI 도 그렇게 읽는다(현재 mock 전용, 실데이터 0/4,535건). 이번 추출은
--    프로젝트 단위 객체라 형태가 아예 다르다. issue_log 는 그대로 둔다.
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS note_extract JSONB;
