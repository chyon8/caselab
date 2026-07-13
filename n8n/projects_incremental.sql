-- CaseLab 증분 동기화 — projects (DATA_INTEGRATION.md §5)
-- 본진 조회 엔드포인트: POST http://wishket-api-server:8001/query
--
-- ⚠️ 날짜 규칙 (어기면 데이터가 조용히 유실된다)
--   date_modified 는 커서다. 이 값이 그대로 CaseLab에 저장됐다가 다음 실행에서
--   아래 WHERE 절로 되돌아온다. 그래서 CONVERT_TZ 를 절대 적용하지 않는다.
--   본진 컬럼은 UTC 저장이므로 UTC ISO(...Z)로 그대로 내보내고,
--   MySQL이 다시 읽을 때는 STR_TO_DATE 로 명시적으로 파싱한다.
--   → 전송 구간은 전부 UTC. KST 변환은 CaseLab 화면에서만 한다.
--
-- 커서 주입 (n8n 표현식):
--   {{TS}} = $('cursor').item.json.ts || '2025-07-13T00:00:00Z'   ← 최초 실행 = 1년 전
--   {{ID}} = $('cursor').item.json.id || 0

SELECT
  pp.id,
  pp.title,
  pp.description,
  pp.budget,
  pp.term,
  pp.term_type,
  pp.status,
  pp.is_cancelled,
  pp.is_rejected,
  pp.management_hide,
  pp.skills_slug,

  -- 커서 및 상태 판정용 날짜 — 전부 UTC ISO, CONVERT_TZ 금지
  DATE_FORMAT(pp.date_modified,          '%Y-%m-%dT%H:%i:%sZ') AS date_modified,
  DATE_FORMAT(pp.date_start_recruitment, '%Y-%m-%dT%H:%i:%sZ') AS date_start_recruitment,
  DATE_FORMAT(pp.date_cancelled,         '%Y-%m-%dT%H:%i:%sZ') AS date_cancelled,
  DATE_FORMAT(pp.date_rejected,          '%Y-%m-%dT%H:%i:%sZ') AS date_rejected,
  DATE_FORMAT(pp.date_deleted,           '%Y-%m-%dT%H:%i:%sZ') AS date_deleted,
  DATE_FORMAT(pp.date_deadline,          '%Y-%m-%dT%H:%i:%sZ') AS date_deadline,

  -- 등록 시 원본 (변경 추적의 기준점)
  iv.budget    AS initial_budget,
  iv.term      AS initial_term,

  -- 아래는 전부 스칼라 서브쿼리 — JOIN 으로 붙이면 행이 뻥튀기된다
  -- ⚠️ PII 정책: 회사명만 가져온다. clientinfo 의 full_name(담당자명)·cell_phone_number·
  --    이메일, client_id 등 고객 식별 정보는 어떤 컬럼도 SELECT 하지 않는다.
  COALESCE(
    (SELECT ci.company_name FROM client_clientinfo ci WHERE ci.project_id = pp.id LIMIT 1),
    (SELECT cc.company_name FROM client_client cc WHERE cc.id = pp.client_id)
  ) AS client_name,

  (SELECT fsc.name
     FROM project_field_projectfieldsubcategory pfs
     JOIN project_field_fieldsubcategory fsc ON fsc.id = pfs.field_subcategory_id
    WHERE pfs.project_id = pp.id AND pfs.is_represent = 1
    LIMIT 1) AS category,

  (SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.last_name,''), COALESCE(u.first_name,''))), ''), u.username)
     FROM auth_user u
    WHERE u.id = pp.inspection_manager_id) AS inspection_manager,

  -- 유효 계약 존재 여부 (§2) — 본진 status 가 뒤처져도 계약/진행/완료로 승격시키는 근거
  EXISTS (
    SELECT 1
      FROM agreement_agreement a
      JOIN sub_contract_subcontract sc ON sc.agreement_id = a.id
     WHERE a.project_id = pp.id
       AND a.hide = 0 AND a.date_deleted IS NULL
       AND sc.is_incomplete_addon = 0 AND sc.is_cancel_addon = 0
  ) AS has_valid_agreement,

  (SELECT a.agreement_price FROM agreement_agreement a
    WHERE a.project_id = pp.id AND a.hide = 0 AND a.date_deleted IS NULL
    ORDER BY a.id DESC LIMIT 1) AS agreement_price,

  (SELECT DATE_FORMAT(a.date_start_progress, '%Y-%m-%dT%H:%i:%sZ') FROM agreement_agreement a
    WHERE a.project_id = pp.id AND a.hide = 0 AND a.date_deleted IS NULL
    ORDER BY a.id DESC LIMIT 1) AS agreement_date_start_progress,

  (SELECT DATE_FORMAT(a.date_completed, '%Y-%m-%dT%H:%i:%sZ') FROM agreement_agreement a
    WHERE a.project_id = pp.id AND a.hide = 0 AND a.date_deleted IS NULL
    ORDER BY a.id DESC LIMIT 1) AS agreement_date_completed

FROM project_project pp
LEFT JOIN project_projectinitialvalue iv ON iv.project_id = pp.id

WHERE
  -- 복합 커서: 같은 date_modified 가 배치 경계에 걸려도 행을 놓치지 않는다
  (
    pp.date_modified >  STR_TO_DATE('{{TS}}', '%Y-%m-%dT%H:%i:%sZ')
    OR (pp.date_modified = STR_TO_DATE('{{TS}}', '%Y-%m-%dT%H:%i:%sZ') AND pp.id > {{ID}})
  )
  -- 등록 전 단계는 동기화 대상이 아니다 (§2-7)
  AND pp.status NOT IN ('open', 'saved', 'frozen')
  -- 핫엣지 가드: 지금 이 순간 커밋 중인 행과 같은 초의 date_modified 를 커서가
  -- 지나쳐 버리면 그 행은 영원히 누락된다. 최신 2분은 읽지 않는다 (다음 주기에 잡힘)
  AND pp.date_modified < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE)
  -- ⚠️ date_deleted IS NULL 필터를 넣지 않는다.
  --    삭제된 행도 가져와야 CaseLab 에 deleted_at 을 마킹할 수 있다 (§5)

ORDER BY pp.date_modified ASC, pp.id ASC
LIMIT 500;
