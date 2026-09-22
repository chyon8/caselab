-- 본진 전용 읽기 쿼리: 분석 베이스라인 한 행/프로젝트.
-- 01_schema_audit.sql, 02_source_profile.sql 검증 후 실행한다. 본진에서 아직 실행하지 않았다.
-- initialvalue.project_id가 중복이면 진행하지 않는다. 제출/재제출 날짜 의미도 확인한다.
-- 먼저 EXPLAIN으로 기존 인덱스 사용 확인. p.id > 0의 0을 마지막 수신 id로 바꿔 페이징.
-- LIMIT 200으로 꽉 찬 마지막 배치는 종료가 아니다. 다음 배치가 0건까지 조회한다.
-- 02의 COUNT와 distinct project_id 건수가 일치해야 한다. 같은 id 재수신은 덮어쓰지 말고 대조.
-- datetime은 UTC ISO. 계약 date는 달력 기준 미확인으로 별도 reference_only다.
-- 조회 시각은 배치마다 기록한다. 기준일 확정 때 결과 날짜를 재검증한다.
-- 초기 원문/사유 본문은 일부러 포함하지 않는다. 텍스트는 CODEBOOK의 별도 절차로
-- 사내에서 최소 필요 범위만 조회/스크럽한다. 이 쿼리는 client_id도 반환하지 않는다.
-- 비어 있는 원문과 원본 레코드 미수집을 구분할 수 있도록 snapshot id/길이를 보존한다.

SELECT
  p.id AS project_id,
  p.previous_project_id,
  p.project_type,
  p.status AS raw_status,
  p.is_rejected,
  p.is_cancelled,
  p.cancel_type AS raw_cancel_type,
  p.management_hide,
  DATE_FORMAT(p.date_created, '%Y-%m-%dT%H:%i:%sZ') AS created_at_utc,
  DATE_FORMAT(p.date_submitted, '%Y-%m-%dT%H:%i:%sZ') AS submitted_at_utc,
  DATE_FORMAT(p.date_start_recruitment, '%Y-%m-%dT%H:%i:%sZ') AS recruited_at_utc,
  DATE_FORMAT(p.date_rejected, '%Y-%m-%dT%H:%i:%sZ') AS rejected_at_utc,
  DATE_FORMAT(p.date_cancelled, '%Y-%m-%dT%H:%i:%sZ') AS cancelled_at_utc,
  DATE_FORMAT(p.date_deleted, '%Y-%m-%dT%H:%i:%sZ') AS deleted_at_utc,
  DATE_FORMAT(p.date_modified, '%Y-%m-%dT%H:%i:%sZ') AS source_modified_at_utc,
  DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ') AS extracted_at_utc,
  iv.id AS initial_snapshot_id,
  DATE_FORMAT(iv.date_created, '%Y-%m-%dT%H:%i:%sZ') AS snapshot_created_at_utc,
  DATE_FORMAT(iv.date_modified, '%Y-%m-%dT%H:%i:%sZ') AS snapshot_modified_at_utc,
  iv.budget AS initial_budget_raw,
  iv.term AS initial_term_raw,
  CHAR_LENGTH(iv.description) AS initial_description_raw_chars,
  p.budget AS current_budget_reference_only,
  p.term AS current_term_reference_only,
  p.term_type,
  p.planning_status AS current_planning_status_reference_only,
  CASE WHEN p.client_id IS NULL THEN 0 ELSE 1 END AS client_key_available,

  -- 본진 내부에서만 고객별 과거 이력 계산. 모든 과거 연도를 조회하고 현재 건은 제외.
  -- 같은 시각의 제출은 과거 이력으로 세지 않는다.
  -- 아래 과거 계약 건수는 현재 hide/deleted 상태에 영향받는 참고값뿐이다.
  -- 계약 당시 유효성·DATE의 달력 기준이 검증되기 전 T0 과거 계약 경험으로 쓰지 않는다.
  CASE WHEN p.client_id IS NULL THEN NULL ELSE (
    SELECT COUNT(*) FROM project_project prior
    WHERE prior.client_id = p.client_id AND prior.id <> p.id
      AND prior.date_submitted < p.date_submitted
  ) END AS prior_platform_submissions,
  CASE WHEN p.client_id IS NULL THEN NULL ELSE (
    SELECT COUNT(*) FROM project_project prior
    WHERE prior.client_id = p.client_id AND prior.id <> p.id
      AND prior.date_submitted < p.date_submitted
      AND prior.date_start_recruitment < p.date_submitted
  ) END AS prior_platform_recruitments,
  CASE WHEN p.client_id IS NULL THEN NULL ELSE (
    SELECT COUNT(*) FROM project_project prior
    WHERE prior.client_id = p.client_id AND prior.id <> p.id
      AND prior.project_type = 'task_based'
      AND prior.date_submitted < p.date_submitted
  ) END AS prior_task_submissions,
  CASE WHEN p.client_id IS NULL THEN NULL ELSE (
    SELECT COUNT(*) FROM project_project prior
    WHERE prior.client_id = p.client_id AND prior.id <> p.id
      AND prior.project_type = 'task_based'
      AND prior.date_submitted < p.date_submitted
      AND prior.date_start_recruitment < p.date_submitted
  ) END AS prior_task_recruitments,
  CASE WHEN p.client_id IS NULL THEN NULL ELSE (
    SELECT COUNT(*) FROM project_project prior
    WHERE prior.client_id = p.client_id AND prior.id <> p.id
      AND prior.project_type = 'task_based'
      AND prior.date_submitted < p.date_submitted
      AND EXISTS (
        SELECT 1 FROM agreement_agreement a
        JOIN sub_contract_subcontract sc ON sc.agreement_id = a.id
        WHERE a.project_id = prior.id AND a.hide = 0 AND a.date_deleted IS NULL
          AND sc.is_incomplete_addon = 0 AND sc.is_cancel_addon = 0
          -- DATE를 KST 달력일이라고 가정한 후보. 의미 확인 전 사용 금지.
          -- 같은 날짜는 제출 이전 체결 여부를 알 수 없으므로 여기서는 제외한다.
          AND sc.date_contracted < DATE(DATE_ADD(p.date_submitted, INTERVAL 9 HOUR))
      )
  ) END AS prior_task_contracts_reference_only,

  -- 독립 고객 표본용. 결과와 무관하게 코호트 첫 제출을 선택(동시 제출은 작은 id).
  -- 고객 식별자는 반환하지 않으며 고객키 결측은 별도 처리한다.
  CASE WHEN p.client_id IS NULL THEN NULL ELSE NOT EXISTS (
    SELECT 1 FROM project_project earlier
    WHERE earlier.client_id = p.client_id AND earlier.project_type = 'task_based'
      AND earlier.date_submitted >= '2025-12-31 15:00:00'
      AND (earlier.date_submitted < p.date_submitted
        OR (earlier.date_submitted = p.date_submitted AND earlier.id < p.id))
  ) END AS is_first_client_project_in_historical_cohort,

  -- 전체 직접 연결 파일과 사용자 업로드 파일을 분리한다.
  -- 임시 프로젝트 연결/당시 연결이력 미검증이면 코드북의 전체 첨부 수로 사용하지 않는다.
  (SELECT COUNT(*) FROM project_projectfile f
    WHERE f.project_id = p.id
      AND f.date_created <= p.date_submitted
      AND (f.date_removed IS NULL OR f.date_removed > p.date_submitted)
  ) AS directly_linked_all_files_at_submit,
  (SELECT COUNT(*) FROM project_projectfile f
    WHERE f.project_id = p.id AND f.user_uploaded = 1
      AND f.date_created <= p.date_submitted
      AND (f.date_removed IS NULL OR f.date_removed > p.date_submitted)
  ) AS directly_linked_user_files_at_submit,
  (SELECT MIN(sc.date_contracted)
    FROM agreement_agreement a
    JOIN sub_contract_subcontract sc ON sc.agreement_id = a.id
    WHERE a.project_id = p.id AND a.hide = 0 AND a.date_deleted IS NULL
      AND sc.is_incomplete_addon = 0 AND sc.is_cancel_addon = 0
  ) AS first_contract_date_reference_only
FROM project_project p
LEFT JOIN project_projectinitialvalue iv ON iv.project_id = p.id
WHERE p.project_type = 'task_based'
  AND p.date_submitted >= '2025-12-31 15:00:00'
  AND p.date_submitted < '2026-08-31 15:00:00'
  AND p.id > 0
ORDER BY p.id ASC
LIMIT 200;
