-- 계약 어드민 링크는 project_id가 아니라 agreement_agreement.id 를 쓴다.
-- (프로젝트 1개에 계약이 여러 개 붙을 수 있어 project_id로는 특정이 안 됨)

ALTER TABLE projects ADD COLUMN IF NOT EXISTS agreement_id BIGINT;
