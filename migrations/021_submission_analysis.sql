-- 제출→모집 분석 전용 원장.
-- 운영 projects 테이블과 분리하여 검수중·모집 전 종료 프로젝트가 화면/리포트에 섞이지 않게 한다.
-- 고객 식별자(client_id 및 해시), 담당자명, 연락처는 저장하지 않는다.

CREATE TABLE IF NOT EXISTS submission_analysis_projects (
  project_id                    BIGINT PRIMARY KEY,
  previous_project_id           BIGINT,
  title                         TEXT,
  raw_status                    TEXT,
  is_rejected                   BOOLEAN,
  is_cancelled                  BOOLEAN,
  raw_cancel_type               TEXT,
  cancel_reason                 TEXT,

  created_at                    TIMESTAMPTZ,
  submitted_at                  TIMESTAMPTZ,
  recruited_at                  TIMESTAMPTZ,
  rejected_at                   TIMESTAMPTZ,
  cancelled_at                  TIMESTAMPTZ,
  deleted_at                    TIMESTAMPTZ,
  source_modified_at            TIMESTAMPTZ,
  source_extracted_at           TIMESTAMPTZ NOT NULL,
  hidden                        BOOLEAN,

  initial_snapshot_id           BIGINT,
  initial_description           TEXT,
  initial_budget                NUMERIC,
  initial_term_days             INT,
  snapshot_created_at           TIMESTAMPTZ,
  snapshot_modified_at          TIMESTAMPTZ,

  categories                    TEXT,
  representative_field          TEXT,
  is_turnkey                    BOOLEAN,
  submit_purpose                TEXT,
  project_has_manage_experience BOOLEAN,
  business_form                 TEXT,
  acquisition_path              TEXT,

  project_purpose               TEXT,
  plan_status                   TEXT,
  detail_plan_status            TEXT,
  budget_option                 TEXT,
  term_option                   TEXT,
  launch_date                   DATE,
  max_launch_date               DATE,
  launch_date_option            TEXT,
  inside_manpower               BOOLEAN,
  detail_inside_manpower        TEXT,
  is_supporting_project         BOOLEAN,
  supporting_project            TEXT,
  is_support_cost               BOOLEAN,
  detail_has_manage_experience  BOOLEAN,
  qualification                TEXT,
  pre_question                  TEXT,
  priority                      TEXT,
  future_plan                   TEXT,

  linked_file_count_at_submit   INT,
  user_file_count_at_submit     INT,
  user_file_bytes_at_submit     BIGINT,

  prior_platform_submissions    INT,
  prior_platform_recruitments   INT,
  prior_task_submissions        INT,
  prior_task_recruitments       INT,
  prior_task_contracts_reference_only INT,
  is_first_client_project_in_cohort BOOLEAN,
  first_contract_date_reference_only DATE,

  ingested_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submission_analysis_submitted
  ON submission_analysis_projects (submitted_at);
CREATE INDEX IF NOT EXISTS idx_submission_analysis_recruited
  ON submission_analysis_projects (recruited_at);
CREATE INDEX IF NOT EXISTS idx_submission_analysis_outcome
  ON submission_analysis_projects (is_rejected, is_cancelled);
