-- 미모집 사유 분석용 거절 대표 사유.
-- 본진 process_log_inspectionlog에서 status='reject'인 최신 로그 note의 첫 줄만 싣는다(최대 100자).
-- 둘째 줄부터는 고객 메일 원문·이메일·실명이 섞여 있어 가져오지 않는다. 거절 로그가 없으면 NULL.

ALTER TABLE submission_analysis_projects
  ADD COLUMN IF NOT EXISTS reject_reason TEXT;
