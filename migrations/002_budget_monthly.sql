-- 기간제(term_based) 프로젝트는 budget이 총액이 아니라 월 단가다.
-- 구분 없이 표시하면 "월 600만원"짜리가 "600만원"으로 보여 예산 규모를 오독한다.
-- (본진 project_project.term_type = 'month' → 기간제)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_monthly BOOLEAN NOT NULL DEFAULT false;
