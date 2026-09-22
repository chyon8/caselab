-- 본진 MySQL/MariaDB 읽기 전용 조사. 01에서 사용 컬럼 존재를 확인한 뒤 한 문장씩 실행.
-- 고정 범위: KST 2026-01-01 00:00 <= 제출 < 2026-09-01 00:00, 외주.
-- 저장 날짜는 UTC라는 기존 문서 가정. 실제 표본 대조 후 확정한다.
-- 아래 조건은 UTC [2025-12-31 15:00:00, 2026-08-31 15:00:00).
-- 삭제/숨김/취소/현재 status 필터를 넣지 않는다. 이 결과는 최종 전환율이 아니다.
-- 초기값 SQL은 projectinitialvalue.project_id 유일성을 확인한 후 실행한다.

-- 제출 월별 기본 규모와 이상 조합. 상태별 건수는 서로 겹칠 수 있다.
SELECT DATE_FORMAT(DATE_ADD(p.date_submitted, INTERVAL 9 HOUR), '%Y-%m') AS submitted_month_kst,
       COUNT(*) AS submitted_n,
       SUM(CASE WHEN p.date_start_recruitment IS NOT NULL THEN 1 ELSE 0 END) AS has_recruitment_date_n,
       SUM(CASE WHEN p.is_rejected = 1 OR p.date_rejected IS NOT NULL THEN 1 ELSE 0 END) AS rejection_flag_or_date_n,
       SUM(CASE WHEN p.is_cancelled = 1 OR p.date_cancelled IS NOT NULL THEN 1 ELSE 0 END) AS cancellation_flag_or_date_n,
       SUM(CASE WHEN p.management_hide = 1 OR p.date_deleted IS NOT NULL THEN 1 ELSE 0 END) AS hidden_or_deleted_n,
       SUM(CASE WHEN p.client_id IS NULL THEN 1 ELSE 0 END) AS missing_client_key_n,
       SUM(CASE WHEN p.date_start_recruitment < p.date_submitted
                     OR p.date_rejected < p.date_submitted
                     OR p.date_cancelled < p.date_submitted THEN 1 ELSE 0 END) AS date_order_anomaly_n,
       SUM(CASE WHEN p.date_start_recruitment IS NOT NULL
                     AND (p.date_rejected IS NOT NULL OR p.date_cancelled IS NOT NULL)
                THEN 1 ELSE 0 END) AS recruitment_and_exit_date_n,
       SUM(CASE WHEN (p.is_rejected = 1 AND p.date_rejected IS NULL)
                     OR (p.is_cancelled = 1 AND p.date_cancelled IS NULL)
                THEN 1 ELSE 0 END) AS exit_flag_without_date_n,
       MIN(p.date_modified) AS source_modified_min_utc,
       MAX(p.date_modified) AS source_modified_max_utc
FROM project_project p
WHERE p.project_type = 'task_based'
  AND p.date_submitted >= '2025-12-31 15:00:00'
  AND p.date_submitted < '2026-08-31 15:00:00'
GROUP BY 1 ORDER BY 1;

-- 제출일 없는 행을 조용히 제외하지 않는다. 생성일이 대상 기간인 행의 후보 건수.
-- 이 건수는 '제출 완료'와 같지 않다. status/이력으로 분모 누락을 점검한다.
SELECT p.status, COUNT(*) AS missing_submission_date_candidate_n
FROM project_project p
WHERE p.project_type = 'task_based'
  AND p.date_submitted IS NULL
  AND p.date_created >= '2025-12-31 15:00:00'
  AND p.date_created < '2026-08-31 15:00:00'
GROUP BY p.status ORDER BY missing_submission_date_candidate_n DESC;

-- 과거에 만든 초안도 대상 기간에 제출됐을 수 있다. 제출일 없는 전체 과거 행을
-- 생성월×상태로 확인한다. 생성일로 제출일을 대체하거나 이 전량을 분모에 넣지 않는다.
SELECT DATE_FORMAT(DATE_ADD(p.date_created, INTERVAL 9 HOUR), '%Y-%m') AS created_month_kst,
       p.status, COUNT(*) AS missing_submission_date_n
FROM project_project p
WHERE p.project_type = 'task_based' AND p.date_submitted IS NULL
  AND p.date_created < '2026-08-31 15:00:00'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 모집 이후 status인데 모집일이 없는 행은 곧바로 비전환으로 코딩하면 안 된다.
SELECT p.status,
       CASE WHEN p.date_start_recruitment IS NULL THEN 0 ELSE 1 END AS has_recruitment_date,
       COUNT(*) AS n
FROM project_project p
WHERE p.project_type = 'task_based'
  AND p.date_submitted >= '2025-12-31 15:00:00'
  AND p.date_submitted < '2026-08-31 15:00:00'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 초기값 JOIN 전 유일성 검사. 0행이면 대상 범위에서 중복 없음.
SELECT iv.project_id, COUNT(*) AS snapshot_rows
FROM project_projectinitialvalue iv
JOIN project_project p ON p.id = iv.project_id
WHERE p.project_type = 'task_based'
  AND p.date_submitted >= '2025-12-31 15:00:00'
  AND p.date_submitted < '2026-08-31 15:00:00'
GROUP BY iv.project_id HAVING COUNT(*) > 1;

-- 월×관측된 모집일 유무별로 초기값 충족률을 확인한다.
-- snapshot_blank와 missing_snapshot은 다르다. date_modified>submitted는 확인 대상이지 수정 확정이 아니다.
SELECT DATE_FORMAT(DATE_ADD(p.date_submitted, INTERVAL 9 HOUR), '%Y-%m') AS submitted_month_kst,
       CASE WHEN p.date_start_recruitment IS NOT NULL THEN 'recruitment_date_present'
            ELSE 'recruitment_date_absent' END AS observed_group,
       COUNT(*) AS n,
       SUM(CASE WHEN iv.project_id IS NULL THEN 1 ELSE 0 END) AS missing_snapshot_n,
       SUM(CASE WHEN iv.project_id IS NOT NULL AND (iv.description IS NULL OR TRIM(iv.description) = '')
                THEN 1 ELSE 0 END) AS snapshot_blank_description_n,
       SUM(CASE WHEN iv.budget > 0 THEN 1 ELSE 0 END) AS initial_budget_positive_n,
       SUM(CASE WHEN iv.term > 0 THEN 1 ELSE 0 END) AS initial_term_positive_n,
       SUM(CASE WHEN iv.date_created > p.date_submitted THEN 1 ELSE 0 END) AS snapshot_created_after_submit_n,
       SUM(CASE WHEN iv.date_modified > p.date_submitted THEN 1 ELSE 0 END) AS snapshot_modified_after_submit_n,
       SUM(CASE WHEN p.planning_status IS NOT NULL AND TRIM(p.planning_status) <> '' THEN 1 ELSE 0 END) AS current_planning_status_present_n,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM detail_projectdetail d WHERE d.project_id = p.id)
                THEN 1 ELSE 0 END) AS detail_row_present_n,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM client_clientinfo ci WHERE ci.project_id = p.id)
                THEN 1 ELSE 0 END) AS clientinfo_row_present_n,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM project_projectfile f
                            WHERE f.project_id = p.id AND f.user_uploaded = 1
                              AND f.date_created <= p.date_submitted
                              AND (f.date_removed IS NULL OR f.date_removed > p.date_submitted))
                THEN 1 ELSE 0 END) AS linked_user_file_present_at_submit_n
FROM project_project p
LEFT JOIN project_projectinitialvalue iv ON iv.project_id = p.id
WHERE p.project_type = 'task_based'
  AND p.date_submitted >= '2025-12-31 15:00:00'
  AND p.date_submitted < '2026-08-31 15:00:00'
GROUP BY 1, 2 ORDER BY 1, 2;

-- 거절/취소 코드를 원래 값 그대로 점검. 라벨 의미는 관리 화면/구현과 대조한다.
-- 모집 전 종료 후보만 집계. 과거 재제출/취소 철회는 이력 확인이 필요하다.
-- 자유서술 본문은 가져오지 않고 유무만 집계한다.
SELECT p.cancel_type,
       CASE WHEN p.is_rejected = 1 OR p.date_rejected IS NOT NULL THEN 1 ELSE 0 END AS has_rejection,
       CASE WHEN p.is_cancelled = 1 OR p.date_cancelled IS NOT NULL THEN 1 ELSE 0 END AS has_cancellation,
       COUNT(*) AS n,
       SUM(CASE WHEN p.management_cancel_reason IS NOT NULL AND TRIM(p.management_cancel_reason) <> ''
                THEN 1 ELSE 0 END) AS has_reason_text_n
FROM project_project p
WHERE p.project_type = 'task_based'
  AND p.date_submitted >= '2025-12-31 15:00:00'
  AND p.date_submitted < '2026-08-31 15:00:00'
  AND p.date_start_recruitment IS NULL
  AND (p.is_rejected = 1 OR p.date_rejected IS NOT NULL
       OR p.is_cancelled = 1 OR p.date_cancelled IS NOT NULL)
GROUP BY 1, 2, 3 ORDER BY n DESC;

-- 반복 고객 규모. client_id는 본진 내부 GROUP BY에만 사용하고 반환하지 않는다.
SELECT COUNT(*) AS known_clients_n,
       SUM(CASE WHEN x.project_n > 1 THEN 1 ELSE 0 END) AS repeat_clients_n,
       SUM(x.project_n) AS projects_with_client_key_n,
       MAX(x.project_n) AS max_projects_per_client
FROM (
  SELECT p.client_id, COUNT(*) AS project_n
  FROM project_project p
  WHERE p.project_type = 'task_based' AND p.client_id IS NOT NULL
    AND p.date_submitted >= '2025-12-31 15:00:00'
    AND p.date_submitted < '2026-08-31 15:00:00'
  GROUP BY p.client_id
) x;
