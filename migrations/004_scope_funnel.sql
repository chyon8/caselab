-- 개발 범위 + 모집 퍼널 (2026-07-14)
--
-- dev_scope      : 개발/기획/디자인 등 복수 선택 (본진 project_project_categories → job_jobcategory.title_kor)
-- is_turnkey     : 턴키 여부
-- planning_status: 보유 기획 자료 수준 (idea/detail/document)
-- proposal_count : 지원자 수 — 퍼널의 첫 단계
--
-- proposal_count 는 증분 동기화로 따라온다. 2026-07-14 본진 실측 결과, 지원이 들어오면
-- project_project.date_modified 도 갱신된다 (5,853/5,920 = 98.9%). 나머지 1.1%는 방금 지원이
-- 들어온 모집중 건으로, 다음 수정 때 따라잡힌다. proposal_proposal 별도 동기화는 필요 없다.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS dev_scope       TEXT,
  ADD COLUMN IF NOT EXISTS is_turnkey      BOOLEAN,
  ADD COLUMN IF NOT EXISTS planning_status TEXT,
  ADD COLUMN IF NOT EXISTS proposal_count  INT;
