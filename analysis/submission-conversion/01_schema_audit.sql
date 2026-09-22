-- 제출→모집 분석: 본진 MySQL/MariaDB 읽기 전용 스키마 조사.
-- SELECT 문을 한 개씩 기존 사내 SQL 조회 도구에서 실행한다.
-- 운영 n8n 적재 워크플로에 연결하지 않는다. 테이블 생성/변경/동기화 없음.
-- 결과는 메타데이터뿐이다. 데이터 행/JSON 값/고객 식별자는 조회하지 않는다.
-- 첫 결과의 queried_at_utc, schema_name, db_version을 조사 기록에 남긴다.

SELECT DATABASE() AS schema_name, VERSION() AS db_version,
       UTC_TIMESTAMP() AS queried_at_utc,
       @@session.time_zone AS session_time_zone;

-- 문서에 있는 원천. 실제 컬럼명/타입/주석을 확인한다.
SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE,
       IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'project_project', 'project_projectinitialvalue', 'detail_projectdetail',
    'client_client', 'client_clientinfo', 'client_clientworker',
    'project_projectfile', 'management_managenote', 'projecthistory_projecthistory',
    'agreement_agreement', 'sub_contract_subcontract', 'meeting_meeting',
    'project_project_categories', 'job_jobcategory',
    'project_field_projectfieldsubcategory', 'project_field_fieldsubcategory'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- 최근 추가된 기업/준비도/유입 필드 후보. 매칭은 존재/의미의 증명이 아니다.
-- partner(공급자) 규모와 client(수요자) 규모를 반드시 구분한다.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    LOWER(COLUMN_NAME) REGEXP
      'company|business|employee|headcount|industry|revenue|enterprise|decision|approv|stakeholder|manpower|developer|fund|budget|launch|kick.?off|submit.?purpose|acquisition|utm|campaign|referrer|form.?version'
    OR COLUMN_COMMENT REGEXP
      '규모|인원|종업|업종|매출|개발자|의사결정|승인|예산|착수|유입|캠페인'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- JSON 필드 안에 신설 문항이 있을 수 있다. 이 결과로 컬럼 후보만 잡고
-- 키 이름/문항 버전/실제 저장 시각은 별도 표본 검사한다. JSON 원문을 일괄 반출하지 않는다.
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND (
    DATA_TYPE = 'json'
    OR LOWER(COLUMN_NAME) REGEXP 'zpzg|answer|question|survey|form|interview|profile|meta'
  )
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- JOIN의 실제 키와 카디널리티 검증 자료. application-only 관계는 없을 수 있다.
SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME,
       REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN (
    'project_project', 'project_projectinitialvalue', 'detail_projectdetail',
    'client_clientinfo', 'project_projectfile', 'management_managenote',
    'projecthistory_projecthistory', 'agreement_agreement', 'sub_contract_subcontract'
  )
ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION;
