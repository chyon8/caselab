-- 제출→모집 전환을 검수 매니저별로 나누기 위한 담당 매니저.
-- 본진 inspection_manager_id의 auth_user 이름(없으면 계정명). projects.inspection_manager와 같은 규칙.
-- 2026-01~08 백필분에는 값이 없다 — n8n 첫 실행을 넓은 창으로 돌려 채운다(n8n/submission_conversion_pipeline.md).

ALTER TABLE submission_analysis_projects
  ADD COLUMN IF NOT EXISTS inspection_manager TEXT;
