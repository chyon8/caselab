-- 개발 범위 + 모집 퍼널 (2026-07-14)
--
-- dev_scope      : 개발/기획/디자인 등 복수 선택 (본진 project_project_categories → job_jobcategory.title_kor)
-- is_turnkey     : 턴키 여부
-- planning_status: 보유 기획 자료 수준 (idea/detail/document)
-- proposal_count : 지원자 수 — 퍼널의 첫 단계
--
-- proposal_count 는 프로젝트 최초 적재 후 proposal_counts_refresh.sql로 계속 갱신한다.
-- 본진 project_project.date_modified는 지원이 들어와도 갱신되지 않으므로 프로젝트 증분
-- 커서만으로는 모집 중 지원수를 실시간 반영할 수 없다.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS dev_scope       TEXT,
  ADD COLUMN IF NOT EXISTS is_turnkey      BOOLEAN,
  ADD COLUMN IF NOT EXISTS planning_status TEXT,
  ADD COLUMN IF NOT EXISTS proposal_count  INT;
