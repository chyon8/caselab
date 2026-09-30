SELECT
  pp.id AS project_id,
  pp.previous_project_id,
  pp.title,
  pp.status AS raw_status,
  pp.is_rejected,
  pp.is_cancelled,
  pp.cancel_type AS raw_cancel_type,
  pp.management_cancel_reason AS cancel_reason,
  DATE_FORMAT(pp.date_created, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
  DATE_FORMAT(pp.date_submitted, '%Y-%m-%dT%H:%i:%sZ') AS submitted_at,
  DATE_FORMAT(pp.date_start_recruitment, '%Y-%m-%dT%H:%i:%sZ') AS recruited_at,
  DATE_FORMAT(pp.date_rejected, '%Y-%m-%dT%H:%i:%sZ') AS rejected_at,
  DATE_FORMAT(pp.date_cancelled, '%Y-%m-%dT%H:%i:%sZ') AS cancelled_at,
  DATE_FORMAT(pp.date_deleted, '%Y-%m-%dT%H:%i:%sZ') AS deleted_at,
  DATE_FORMAT(pp.date_modified, '%Y-%m-%dT%H:%i:%sZ') AS source_modified_at,
  DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT%H:%i:%sZ') AS source_extracted_at,
  pp.management_hide AS hidden,
  (SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.last_name,''), COALESCE(u.first_name,''))), ''), u.username)
     FROM auth_user u
    WHERE u.id = pp.inspection_manager_id) AS inspection_manager,
  (SELECT CASE WHEN TRIM(il.note) LIKE '어뷰징%'
                 OR TRIM(il.note) LIKE '중복 등록%'
                 OR TRIM(il.note) LIKE '중복등록%'
                 OR TRIM(il.note) LIKE '프로젝트 중복등록%'
                 OR TRIM(il.note) LIKE 'Test%'
                 OR TRIM(il.note) LIKE '테스트%'
                 OR TRIM(il.note) LIKE '실수%'
                 OR TRIM(il.note) LIKE '지원사업 선정 전%'
                 OR TRIM(il.note) LIKE '지원 사업 선정 전%'
                 OR TRIM(il.note) LIKE '발주처와 계약 전%'
                 OR TRIM(il.note) LIKE '등록 불가 업무%'
                 OR TRIM(il.note) LIKE '위시켓 이용 제한%'
                 OR TRIM(il.note) LIKE '위시켓 이용 불가%'
                 OR TRIM(il.note) LIKE 'IT 업무가 아님%'
                 OR TRIM(il.note) LIKE '이용 약관 위배%'
                 OR TRIM(il.note) LIKE '타깃 서비스 이용 약관 위배%'
                 OR TRIM(il.note) LIKE '대학교 과제%'
               THEN 1 ELSE 0 END
     FROM process_log_inspectionlog il
    WHERE il.project_id = pp.id AND il.status = 'reject'
    ORDER BY il.id DESC LIMIT 1) AS reject_invalid,

  iv.id AS initial_snapshot_id,
  iv.description AS initial_description,
  iv.budget AS initial_budget,
  iv.term AS initial_term_days,
  DATE_FORMAT(iv.date_created, '%Y-%m-%dT%H:%i:%sZ') AS snapshot_created_at,
  DATE_FORMAT(iv.date_modified, '%Y-%m-%dT%H:%i:%sZ') AS snapshot_modified_at,

  (SELECT GROUP_CONCAT(jc.title_kor ORDER BY jc.seq_num SEPARATOR ',')
     FROM project_project_categories ppc
     JOIN job_jobcategory jc ON jc.id = ppc.jobcategory_id
    WHERE ppc.project_id = pp.id) AS categories,
  (SELECT fsc.name
     FROM project_field_projectfieldsubcategory pfs
     JOIN project_field_fieldsubcategory fsc ON fsc.id = pfs.field_subcategory_id
    WHERE pfs.project_id = pp.id AND pfs.is_represent = 1
    ORDER BY pfs.date_created ASC LIMIT 1) AS representative_field,
  pp.is_turnkey,
  pp.submit_purpose,
  pp.has_manage_experience AS project_has_manage_experience,
  (SELECT ci.form_of_business FROM client_clientinfo ci
    WHERE ci.project_id = pp.id ORDER BY ci.date_created ASC LIMIT 1) AS business_form,
  (SELECT cc.acquisition_path FROM client_client cc WHERE cc.id = pp.client_id) AS acquisition_path,

  d.project_purpose,
  d.plan_status,
  d.detail_plan_status,
  d.budget_option,
  d.term_option,
  DATE_FORMAT(d.launch_date, '%Y-%m-%d') AS launch_date,
  DATE_FORMAT(d.max_launch_date, '%Y-%m-%d') AS max_launch_date,
  d.launch_date_option,
  d.inside_manpower,
  d.detail_inside_manpower,
  d.is_supporting_project,
  d.supporting_project,
  d.is_support_cost,
  d.has_manage_experience AS detail_has_manage_experience,
  d.qualification,
  d.pre_question,
  d.priority,
  d.future_plan,

  (SELECT COUNT(*) FROM project_projectfile f
    WHERE f.project_id = pp.id AND f.date_created <= pp.date_submitted
      AND (f.date_removed IS NULL OR f.date_removed > pp.date_submitted)
  ) AS linked_file_count_at_submit,
  (SELECT COUNT(*) FROM project_projectfile f
    WHERE f.project_id = pp.id AND f.user_uploaded = 1
      AND f.date_created <= pp.date_submitted
      AND (f.date_removed IS NULL OR f.date_removed > pp.date_submitted)
  ) AS user_file_count_at_submit,
  (SELECT COALESCE(SUM(f.size), 0) FROM project_projectfile f
    WHERE f.project_id = pp.id AND f.user_uploaded = 1
      AND f.date_created <= pp.date_submitted
      AND (f.date_removed IS NULL OR f.date_removed > pp.date_submitted)
  ) AS user_file_bytes_at_submit,

  CASE WHEN pp.client_id IS NULL THEN NULL ELSE (
    SELECT COUNT(*) FROM project_project prior
    WHERE prior.client_id = pp.client_id AND prior.id <> pp.id
      AND prior.date_submitted < pp.date_submitted
  ) END AS prior_platform_submissions,
  CASE WHEN pp.client_id IS NULL THEN NULL ELSE (
    SELECT COUNT(*) FROM project_project prior
    WHERE prior.client_id = pp.client_id AND prior.id <> pp.id
      AND prior.date_submitted < pp.date_submitted
      AND prior.date_start_recruitment < pp.date_submitted
  ) END AS prior_platform_recruitments,
  CASE WHEN pp.client_id IS NULL THEN NULL ELSE (
    SELECT COUNT(*) FROM project_project prior
    WHERE prior.client_id = pp.client_id AND prior.id <> pp.id
      AND prior.project_type = 'task_based' AND prior.date_submitted < pp.date_submitted
  ) END AS prior_task_submissions,
  CASE WHEN pp.client_id IS NULL THEN NULL ELSE (
    SELECT COUNT(*) FROM project_project prior
    WHERE prior.client_id = pp.client_id AND prior.id <> pp.id
      AND prior.project_type = 'task_based' AND prior.date_submitted < pp.date_submitted
      AND prior.date_start_recruitment < pp.date_submitted
  ) END AS prior_task_recruitments,
  CASE WHEN pp.client_id IS NULL THEN NULL ELSE (
    SELECT COUNT(*) FROM project_project prior
    WHERE prior.client_id = pp.client_id AND prior.id <> pp.id
      AND prior.project_type = 'task_based' AND prior.date_submitted < pp.date_submitted
      AND EXISTS (
        SELECT 1 FROM agreement_agreement a
        JOIN sub_contract_subcontract sc ON sc.agreement_id = a.id
        WHERE a.project_id = prior.id AND a.hide = 0 AND a.date_deleted IS NULL
          AND sc.is_incomplete_addon = 0 AND sc.is_cancel_addon = 0
          AND sc.date_contracted < DATE(DATE_ADD(pp.date_submitted, INTERVAL 9 HOUR))
      )
  ) END AS prior_task_contracts_reference_only,
  CASE WHEN pp.client_id IS NULL THEN NULL ELSE NOT EXISTS (
    SELECT 1 FROM project_project earlier
    WHERE earlier.client_id = pp.client_id AND earlier.project_type = 'task_based'
      AND earlier.date_submitted >= '2025-12-31 15:00:00'
      AND (earlier.date_submitted < pp.date_submitted
        OR (earlier.date_submitted = pp.date_submitted AND earlier.id < pp.id))
  ) END AS is_first_client_project_in_cohort,
  (SELECT MIN(sc.date_contracted)
     FROM agreement_agreement a
     JOIN sub_contract_subcontract sc ON sc.agreement_id = a.id
    WHERE a.project_id = pp.id AND a.hide = 0 AND a.date_deleted IS NULL
      AND sc.is_incomplete_addon = 0 AND sc.is_cancel_addon = 0
  ) AS first_contract_date_reference_only

FROM project_project pp
LEFT JOIN project_projectinitialvalue iv ON iv.project_id = pp.id
LEFT JOIN detail_projectdetail d ON d.project_id = pp.id
WHERE pp.project_type = 'task_based'
  AND pp.date_submitted >= GREATEST('2025-12-31 15:00:00', UTC_TIMESTAMP() - INTERVAL 60 DAY)
  AND pp.id > {{ $json.id }}
ORDER BY pp.id ASC
LIMIT 200;
