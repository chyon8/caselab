-- 개발 범위 + 모집 퍼널 (2026-07-14)
--
-- dev_scope      : 개발/기획/디자인 등 복수 선택 (본진 project_project_categories → job_jobcategory.title_kor)
-- is_turnkey     : 턴키 여부
-- planning_status: 보유 기획 자료 수준 (idea/detail/document)
-- proposal_count : 지원자 수 — 퍼널의 첫 단계
--
-- ⚠️ proposal_count 는 낡을 수 있다. 지원자가 새로 들어와도 본진 project_project.date_modified 가
--    바뀌지 않으면 증분 동기화가 그 행을 다시 가져오지 않는다. 정확한 퍼널이 필요해지면
--    proposal_proposal 을 별도 동기화해서 CaseLab 에서 직접 세야 한다.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS dev_scope       TEXT,
  ADD COLUMN IF NOT EXISTS is_turnkey      BOOLEAN,
  ADD COLUMN IF NOT EXISTS planning_status TEXT,
  ADD COLUMN IF NOT EXISTS proposal_count  INT;
