-- 기업 규모 수집 시작: 2026-09-03, 사용자 확인. 정확한 배포 시각/노출 경로는 미확인.
-- 이 쿼리는 신필드가 아닌 공통 프로젝트 메타데이터만 조회한다.
-- 실제 신필드 스키마를 받은 뒤 폼 노출 조건/값 보유율을 별도로 LEFT JOIN해야 한다.
-- 새 규모 필드가 채워진 행만 선택해서 분모를 만들지 않는다.
-- 진단용, 읽기 전용. SQL 한 번 실행 내 UTC_TIMESTAMP() 기준으로 관찰기회를 계산한다.
SELECT DATE_FORMAT(DATE_ADD(p.date_submitted, INTERVAL 9 HOUR), '%Y-%m-%d') AS submitted_day_kst,
       UTC_TIMESTAMP() AS observed_at_utc,
       COUNT(*) AS submitted_n,
       SUM(CASE WHEN p.date_submitted <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)
                THEN 1 ELSE 0 END) AS mature_7d_n,
       SUM(CASE WHEN p.date_submitted <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 14 DAY)
                THEN 1 ELSE 0 END) AS mature_14d_n,
       SUM(CASE WHEN p.date_submitted <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
                THEN 1 ELSE 0 END) AS mature_30d_n,
       SUM(CASE WHEN p.date_submitted <= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)
                THEN 1 ELSE 0 END) AS mature_90d_n,
       SUM(CASE WHEN p.date_start_recruitment IS NOT NULL THEN 1 ELSE 0 END) AS recruitment_date_present_n
FROM project_project p
WHERE p.project_type = 'task_based'
  AND p.date_submitted >= '2026-09-02 15:00:00'
  AND p.date_submitted <= UTC_TIMESTAMP()
GROUP BY 1 ORDER BY 1;
