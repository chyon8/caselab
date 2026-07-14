-- CaseLab 증분 동기화 — 내부 매니저 코멘트
-- 본진: management_managenote  (개발사 댓글인 comment_projectcomment 와는 완전히 다른 테이블)
-- 수신: POST /api/sync/timeline   (source='managenote')
--
-- ⚠️ projects 워크플로가 먼저 돌아야 한다. 프로젝트가 아직 CaseLab에 없으면 그 노트는 skip 되고,
--    수신 라우트는 skip 이 하나라도 있으면 커서를 세우지 않는다.
--
-- ⚠️ PII: 매니저 노트 본문에는 고객 연락처가 자주 박혀 있다. 수신 라우트가 저장 전에 스크럽한다
--    (scrubPii — 전화·이메일·주민번호). 작성자는 사내 직원이므로 실명을 가져온다.
--
-- 커서는 아래 WHERE 절에 n8n 표현식으로 박아뒀다. 그대로 복사해 ③ 조회 노드에 붙여넣으면 된다.
--   전제: 앞 노드 이름이 'cursor' 이고 GET /api/sync/cursor?source=managenote 를 호출한다
--
--   커서는 date_created 기준이다. managenote 에는 date_modified 가 없어서, 이미 가져온 노트를
--   나중에 수정해도 다시 받지 않는다 (qna 와 같은 한계).

SELECT
  n.project_id,
  'managenote'                                      AS source,
  n.id                                              AS source_id,
  DATE_FORMAT(n.date_created, '%Y-%m-%dT%H:%i:%sZ') AS event_at,
  -- 분류는 note_type 이 아니라 flag 다 (normal=일반, notice=공지)
  IF(n.flag = 'notice', '공지', '일반')             AS title,
  n.body                                            AS body,

  JSON_OBJECT(
    'flag',          n.flag,
    'detail_option', n.detail_option,
    'by', (SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.last_name,''), COALESCE(u.first_name,''))), ''), u.username)
             FROM auth_user u WHERE u.id = n.created_by_id),
    'due_at', DATE_FORMAT(n.date_due, '%Y-%m-%dT%H:%i:%sZ')
  )                                                 AS meta

FROM management_managenote n

-- ⚠️ 백필 범위와 똑같이 좁힌다 (없으면 범위 밖 노트가 섞여 커서가 영원히 멈춘다)
JOIN project_project pp
  ON pp.id = n.project_id
 AND pp.date_start_recruitment >= '2024-11-11 00:00:00'
 AND pp.status IN ('recruiting', 'close_recruiting', 'contracted', 'completed')
 AND pp.project_type = 'task_based'

WHERE
  n.is_delete = 0
  -- 사람이 쓴 메모만. 화이트리스트인 이유: 새 flag 가 생겨도 조용히 섞여 들어오지 않는다.
  --   normal(일반)·notice(공지) 만 가져온다 — 약 12.9만 건
  --   제외: 지피지기(요청), meeting/sys(시스템 생성, 미팅은 meeting_meeting 이 원천),
  --         checklist/recruit(프로젝트당 1개 자동 생성 템플릿)
  AND n.note_type = 'memo'
  AND n.flag IN ('normal', 'notice')
  AND (
    n.date_created >  STR_TO_DATE('{{ $("cursor").first().json.ts || "2000-01-01T00:00:00Z" }}', '%Y-%m-%dT%H:%i:%sZ')
    OR (n.date_created = STR_TO_DATE('{{ $("cursor").first().json.ts || "2000-01-01T00:00:00Z" }}', '%Y-%m-%dT%H:%i:%sZ')
        AND n.id > {{ $("cursor").first().json.id || 0 }})
  )
  AND n.date_created < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE)   -- 핫엣지 가드

ORDER BY n.date_created ASC, n.id ASC
LIMIT 200;
