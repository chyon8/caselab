-- 라이프사이클 날짜 (2026-07-14)
--
-- 기간 필터가 source_modified_at(본진 date_modified) 기준으로 돌고 있었다. 그건 "최근에 뭐라도
-- 수정된 건"이지 "언제 들어온 건"이 아니다. 검수 시작·모집 시작을 별도로 들고 있어야
-- "이번 주 검수 들어온 건" 같은 질문에 답할 수 있다.
--
-- recruit_started_at 은 이미 n8n 이 전송하고 있었으나 저장하지 않고 버리던 값이다
-- (백필 범위를 정하는 기준이 바로 이 컬럼인데도).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS submitted_at       TIMESTAMPTZ,  -- project_project.date_submitted (검수 시작)
  ADD COLUMN IF NOT EXISTS recruit_started_at TIMESTAMPTZ;  -- project_project.date_start_recruitment (모집 시작)

CREATE INDEX IF NOT EXISTS idx_projects_submitted ON projects (submitted_at DESC);
