-- 상세 조건이 제출 전에 작성됐는지 판별하기 위한 시각.
-- 값 자체를 T0(제출 시점) 특성으로 쓰기 전에 반드시 이 값과 submitted_at을 대조한다.

ALTER TABLE submission_analysis_projects
  ADD COLUMN IF NOT EXISTS detail_created_at TIMESTAMPTZ;
