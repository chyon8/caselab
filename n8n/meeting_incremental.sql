-- CaseLab 증분 동기화 — 개발사 사전 미팅
-- 본진: meeting_meeting
-- 수신: POST /api/sync/timeline   (source='meeting' — qna 와 같은 라우트를 재사용)
--
-- ⚠️ projects 워크플로가 먼저 돌아야 한다. 프로젝트가 아직 CaseLab에 없으면
--    그 미팅은 skip으로 반환되고 커서가 전진하지 않아 다음 주기에 재시도된다.
--
-- ⚠️ PII 가드레일 (best-effort): 아래 컬럼은 SELECT 자체를 하지 않는다 —
--    client_cell_phone_number, partner_cell_phone_number (연락처),
--    client_memo, partner_memo, client_request (자유 텍스트 요청),
--    loc_meeting, loc_meeting_url (장소·주소). 구조적 코드/일시/ID만 넘긴다.
--
-- ⚠️ 커서 = date_created (event_at 과 동일 컬럼이어야 한다 — 수신 라우트가 event_at 으로
--    커서를 전진시키므로). date_meeting 은 미래일·가변이라 커서로 못 쓴다. 표시용으로 meta 에 담는다.
--    → 한계: 이미 동기화된 미팅이 나중에 취소/조율돼도 date_created 가 안 바뀌면 재수신되지 않는다
--      (qna·managenote 와 같은 한계). 이슈면 커서를 date_modified 로 바꾸는 건 라우트 변경이 필요하다.
--
-- 커서는 아래 WHERE 절에 n8n 표현식으로 박아뒀다. 그대로 복사해 ③ 조회 노드에 붙여넣으면 된다.
--   전제: 앞 노드 이름이 'cursor' 이고 GET /api/sync/cursor?source=meetings 를 호출한다.

SELECT
  m.project_id,
  'meeting'                                        AS source,
  m.id                                             AS source_id,
  DATE_FORMAT(m.date_created, '%Y-%m-%dT%H:%i:%sZ') AS event_at,
  '모집'                                           AS stage,

  IF(m.is_cancelled = 1, '개발사 미팅 취소', '개발사 사전 미팅') AS title,

  -- 방식 · 결과 (구조적 라벨만 — 자유 텍스트 아님)
  CONCAT_WS(' · ',
    CASE m.method
      WHEN 0 THEN '위시켓'  WHEN 1 THEN '외부'   WHEN 2 THEN '카카오톡'
      WHEN 3 THEN '대면'    WHEN 4 THEN '화상'   WHEN 5 THEN '전화'
      ELSE '기타'
    END,
    IF(pr.partners_id IS NOT NULL,
       CONCAT('파트너 #', pr.partners_id,
              IF(pt.grade IS NOT NULL OR pt.job_slug IS NOT NULL,
                 CONCAT(' (', CONCAT_WS('·', pt.grade, pt.job_slug), ')'), '')),
       NULL),
    IF(m.is_contracted = 1, '계약 성사', NULL),
    IF(m.date_meeting IS NOT NULL, CONCAT('미팅일 ', DATE_FORMAT(m.date_meeting, '%Y-%m-%d')), NULL)
  )                                                AS body,

  JSON_OBJECT(
    'method',        m.method,
    'tune_status',   m.tune_status,
    'is_contracted', IF(m.is_contracted = 1, TRUE, FALSE),
    'is_cancelled',  IF(m.is_cancelled = 1, TRUE, FALSE),
    'proposal_id',   m.proposal_id,
    -- 파트너 식별 — partners_partners 엔 이름 컬럼이 없다(정체성은 auth_user=개인 실명, PII라 안 가져옴).
    -- partner_id 는 "어떤 파트너와 미팅 → 그 녹취" 매핑 + 파트너 성과 집계의 키. grade·job_slug 는 라벨·세그먼트용 비-PII.
    'partner_id',    pr.partners_id,
    'partner_grade', pt.grade,
    'partner_job',   pt.job_slug,
    'date_meeting',  DATE_FORMAT(m.date_meeting, '%Y-%m-%dT%H:%i:%sZ')
  )                                                AS meta

FROM meeting_meeting m
-- 파트너는 meeting 에 직접 없고 proposal 을 거친다. proposal 이 없는 미팅도 사건이므로 LEFT JOIN.
LEFT JOIN proposal_proposal pr ON pr.id = m.proposal_id
LEFT JOIN partners_partners pt ON pt.id = pr.partners_id   -- grade·job_slug (비-PII). 실명 없음.

-- ⚠️ 백필 범위와 똑같이 좁힌다. 없으면 CaseLab 에 없는 프로젝트의 미팅이 섞여 skip 무한 재시도된다.
JOIN project_project pp
  ON pp.id = m.project_id
 AND pp.date_start_recruitment >= '2024-11-11 00:00:00'
 AND pp.status IN ('recruiting', 'close_recruiting', 'contracted', 'completed')
 AND pp.project_type = 'task_based'

WHERE
  m.project_id IS NOT NULL
  AND m.method <> 8          -- 8 = '미팅 없음' — 실제 사건이 아니므로 제외
  AND (
    m.date_created >  STR_TO_DATE('{{ $("cursor").first().json.ts || "2000-01-01T00:00:00Z" }}', '%Y-%m-%dT%H:%i:%sZ')
    OR (m.date_created = STR_TO_DATE('{{ $("cursor").first().json.ts || "2000-01-01T00:00:00Z" }}', '%Y-%m-%dT%H:%i:%sZ')
        AND m.id > {{ $("cursor").first().json.id || 0 }})
  )
  AND m.date_created < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE)   -- 핫엣지 가드

ORDER BY m.date_created ASC, m.id ASC
LIMIT 200;
