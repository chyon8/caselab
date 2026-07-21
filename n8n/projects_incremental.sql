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
-- 커서는 아래 WHERE 절에 n8n 표현식으로 박아뒀다. 이 파일을 그대로 복사해서
-- ③ 조회 노드의 body(표현식 모드)에 붙여넣으면 된다. 손댈 곳 없다.
--   전제: 커서를 물어오는 앞 노드의 이름이 'cursor' 여야 한다 (GET /api/sync/cursor?source=projects).
--         노드 이름이 다르면 $("cursor") 안의 이름을 바꾼다.
--
--   ⚠️ 커서 초기값이 2000-01-01 인 이유: 커서는 date_modified 기준인데 대상 범위는
--      date_start_recruitment 기준이다. 서로 다른 컬럼이므로 커서 초기값을 2024-11-11 로
--      맞추면, 모집 전환은 2024-11-11 이후인데 date_modified 가 그보다 앞선 행이 조용히
--      스킵된다. 범위는 아래 WHERE 절이 잡으므로 커서는 충분히 과거로 둔다.

SELECT
  pp.id,
  pp.title,
  pp.project_type,
  pp.description,
  pp.budget,
  pp.term,
  pp.term_type,
  pp.status,
  pp.is_cancelled,
  pp.is_rejected,
  pp.management_hide,
  pp.skills_slug,
  pp.is_turnkey,
  pp.planning_status,
  pp.proposal_count,        -- 퍼널 1단. 지원이 들어오면 date_modified 도 갱신된다 (2026-07-14 실측: 98.9%)

  -- 개발 범위 (개발/기획/디자인 등 복수) — M:N 이라 스칼라 서브쿼리로 이어붙인다
  (SELECT GROUP_CONCAT(jc.title_kor ORDER BY jc.seq_num SEPARATOR ',')
     FROM project_project_categories ppc
     JOIN job_jobcategory jc ON jc.id = ppc.jobcategory_id
    WHERE ppc.project_id = pp.id) AS categories,

  -- 커서 및 상태 판정용 날짜 — 전부 UTC ISO, CONVERT_TZ 금지
  DATE_FORMAT(pp.date_modified,          '%Y-%m-%dT%H:%i:%sZ') AS date_modified,
  DATE_FORMAT(pp.date_submitted,         '%Y-%m-%dT%H:%i:%sZ') AS date_submitted,
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

  -- 계약 어드민 링크용 PK (project_id로는 계약을 특정할 수 없다)
  (SELECT a.id FROM agreement_agreement a
    WHERE a.project_id = pp.id AND a.hide = 0 AND a.date_deleted IS NULL
    ORDER BY a.id DESC LIMIT 1) AS agreement_id,

  -- 계약금액 = 유효 특약(sub_contract) 합. 특약제 계약은 헤더 a.agreement_price 가 흔히 0이라
  --   그대로 쓰면 실제 금액이 안 잡힌다(=계약금액 0원 정체의 원인). 돈은 특약 행에 있다.
  --   has_valid_agreement 와 같은 조건(is_incomplete_addon=0 AND is_cancel_addon=0)으로 합산 →
  --   증액(추가 특약) 자동 반영. 별칭은 agreement_price 유지(mapping 이 contract_amount 로 읽음).
  (SELECT COALESCE(SUM(sc.total_price), 0)
     FROM agreement_agreement a
     JOIN sub_contract_subcontract sc ON sc.agreement_id = a.id
    WHERE a.project_id = pp.id AND a.hide = 0 AND a.date_deleted IS NULL
      AND sc.is_incomplete_addon = 0 AND sc.is_cancel_addon = 0) AS agreement_price,

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
    pp.date_modified >  STR_TO_DATE('{{ $("cursor").first().json.ts || "2000-01-01T00:00:00Z" }}', '%Y-%m-%dT%H:%i:%sZ')
    OR (pp.date_modified = STR_TO_DATE('{{ $("cursor").first().json.ts || "2000-01-01T00:00:00Z" }}', '%Y-%m-%dT%H:%i:%sZ')
        AND pp.id > {{ $("cursor").first().json.id || 0 }})
  )
  -- 대상 범위 (2026-07-14 확정): 2024-11-11 이후 모집 전환된 외주 프로젝트
  --   · date_start_recruitment — 모집중으로 넘어간 시점. 등록일(date_created)이 아니다.
  --   · status — 검수중(submitted)은 아직 모집 전환에 실패한 건이므로 제외.
  --              등록 전 단계(open/saved/frozen)도 자연히 빠진다.
  --   · project_type — 기간제(term_based) 제외, 외주(task_based)만.
  AND pp.date_start_recruitment >= '2024-11-11 00:00:00'
  AND pp.status IN ('recruiting', 'close_recruiting', 'contracted', 'completed')
  AND pp.project_type = 'task_based'
  -- 핫엣지 가드: 지금 이 순간 커밋 중인 행과 같은 초의 date_modified 를 커서가
  -- 지나쳐 버리면 그 행은 영원히 누락된다. 최신 2분은 읽지 않는다 (다음 주기에 잡힘)
  AND pp.date_modified < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE)
  -- ⚠️ date_deleted IS NULL 필터를 넣지 않는다.
  --    삭제된 행도 가져와야 CaseLab 에 deleted_at 을 마킹할 수 있다 (§5)

ORDER BY pp.date_modified ASC, pp.id ASC
-- ⚠️ 500 으로 올리지 않는다. description 은 최대 5,000자이고 한글은 UTF-8 에서 3바이트라
--    긴 공고가 몰린 배치는 500 × 15KB = 7.5MB 로 Vercel 한도(4.5MB)를 넘긴다. 그러면
--    커서가 전진하지 못해 같은 배치를 무한 재시도하며 백필이 그 자리에 멈춘다.
LIMIT 400;
