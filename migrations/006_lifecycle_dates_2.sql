-- 라이프사이클 날짜 2차 (2026-07-14)
--
-- 아래 날짜들은 n8n 이 이미 실어보내고 있으나, CaseLab 이 상태 판정(mapStatus)에만 쓰고
-- 버리고 있었다. 저장하면 "기간"을 계산할 수 있다:
--   · 모집에 며칠 걸렸나        recruit_started_at → contracted
--   · 계약에서 착수까지 며칠     progress_started_at
--   · 총 소요 기간              completed_at - submitted_at
--   · 취소는 언제 터졌나        cancelled_at
--
-- 이 값들이 유사사례 집계 뷰("이 유형은 모집 평균 3주, 계약률 40%")의 재료다.
-- 타임라인용이 아니다 — 타임라인은 meeting_meeting 등 실제 사건으로 채운다.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS progress_started_at TIMESTAMPTZ,  -- agreement.date_start_progress (진행 착수)
  ADD COLUMN IF NOT EXISTS completed_at        TIMESTAMPTZ,  -- agreement.date_completed (완료)
  ADD COLUMN IF NOT EXISTS cancelled_at        TIMESTAMPTZ,  -- project_project.date_cancelled
  ADD COLUMN IF NOT EXISTS rejected_at         TIMESTAMPTZ;  -- project_project.date_rejected
