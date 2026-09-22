-- CaseLab Neon/Postgres 전용. 본진 MySQL 파일(01~04)과 실행 환경이 다르다.
-- 2026-09-22 계획 단계에서 수행한 읽기 전용 감사의 재현 쿼리.
-- 숨김/삭제를 포함하며, 이 DB 자체가 모집 이후만 수집하므로 전체 제출 수가 아니다.
SELECT COUNT(*) AS projects,
       COUNT(*) FILTER (WHERE recruit_started_at IS NOT NULL) AS with_recruitment,
       COUNT(*) FILTER (WHERE initial_budget > 0) AS positive_initial_budget,
       COUNT(*) FILTER (WHERE initial_term_days > 0) AS positive_initial_term,
       COUNT(*) FILTER (WHERE posting_raw IS NOT NULL AND LENGTH(TRIM(posting_raw)) > 0) AS current_description,
       COUNT(*) FILTER (WHERE planning_status IS NOT NULL AND LENGTH(TRIM(planning_status)) > 0) AS current_planning_status,
       COUNT(*) FILTER (WHERE deleted_at IS NOT NULL OR hidden) AS hidden_or_deleted
FROM projects
WHERE submitted_at >= '2026-01-01T00:00:00+09:00'::timestamptz
  AND submitted_at < '2026-09-01T00:00:00+09:00'::timestamptz;

SELECT TO_CHAR(submitted_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS submitted_month,
       COUNT(*) AS n,
       COUNT(*) FILTER (WHERE initial_budget > 0) AS initial_budget_positive,
       COUNT(*) FILTER (WHERE initial_term_days > 0) AS initial_term_positive
FROM projects
WHERE submitted_at >= '2026-01-01T00:00:00+09:00'::timestamptz
  AND submitted_at < '2026-09-01T00:00:00+09:00'::timestamptz
GROUP BY 1 ORDER BY 1;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'projects'
ORDER BY ordinal_position;
