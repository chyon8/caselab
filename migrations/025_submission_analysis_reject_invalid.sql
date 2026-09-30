-- 거절 중 무효(중복등록·실수·Test 등)를 전환 집계에서 빼기 위한 표시.
-- 본진 process_log_inspectionlog에서 status='reject'인 최신 로그 note의 첫머리로 판정한다(Tableau «부적합 사유|유무효»와 같은 기준).
-- note 원문은 개인정보가 섞여 있어 가져오지 않고, 판정 결과만 싣는다. 거절 로그가 없으면 NULL.

ALTER TABLE submission_analysis_projects
  ADD COLUMN IF NOT EXISTS reject_invalid BOOLEAN;
