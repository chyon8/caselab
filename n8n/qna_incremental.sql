-- CaseLab 증분 동기화 — Q&A (개발사 문의 댓글)
-- 본진: comment_projectcomment (+ comment_commentreply 답글)
-- 수신: POST /api/sync/timeline   (source='qna')
--
-- ⚠️ projects 워크플로가 먼저 돌아야 한다. 프로젝트가 아직 CaseLab에 없으면
--    그 댓글은 skip으로 반환되고 커서가 전진하지 않아 다음 주기에 재시도된다.
--
-- ⚠️ PII: 작성자는 실명이 아니라 계정명만 가져온다. 이메일·전화번호는 SELECT하지 않는다.
--
-- 커서는 아래 WHERE 절에 n8n 표현식으로 박아뒀다. 그대로 복사해 ③ 조회 노드에 붙여넣으면 된다.
--   전제: 앞 노드 이름이 'cursor' 이고 GET /api/sync/cursor?source=qna 를 호출한다 (source 가 projects 아님)

SELECT
  c.project_id,
  'qna'                                            AS source,
  c.id                                             AS source_id,
  DATE_FORMAT(c.date_created, '%Y-%m-%dT%H:%i:%sZ') AS event_at,
  c.body                                           AS title,   -- 질문 본문 (CaseLab의 qna.q)

  -- 답글이 있으면 본문에 이어붙인다 (별도 이벤트로 쪼개지 않는다)
  (SELECT GROUP_CONCAT(r.body SEPARATOR '\n---\n')
     FROM comment_commentreply r
    WHERE r.comment_id = c.id)                     AS body,

  JSON_OBJECT(
    'by', (SELECT u.username FROM auth_user u WHERE u.id = c.user_id),
    -- 비공개 여부를 화면에서 구분할 수 있게 넘긴다 (status: 0 비공개, 1 공개)
    'is_private', IF(c.status = 0, TRUE, FALSE),
    'reply_count', (SELECT COUNT(*) FROM comment_commentreply r
                     WHERE r.comment_id = c.id)
  )                                                AS meta

FROM comment_projectcomment c

-- ⚠️ 백필 범위와 똑같이 좁힌다. 이 JOIN 이 없으면 CaseLab 에 없는 프로젝트의 댓글이 섞여 들어오고,
--    수신 라우트는 skip 이 하나라도 있으면 커서를 세우지 않으므로(timeline/route.ts) 같은 배치를
--    무한 재시도하며 한 건도 못 넣는다.
JOIN project_project pp
  ON pp.id = c.project_id
 AND pp.date_start_recruitment >= '2024-11-11 00:00:00'
 AND pp.status IN ('recruiting', 'close_recruiting', 'contracted', 'completed')
 AND pp.project_type = 'task_based'

WHERE
  -- ⚠️ status 로 거르지 않는다 (2026-07-14 결정). 개발사 댓글의 88%가 비공개(status=0)라
  --    공개만 긁으면 "개발사가 뭘 묻는가"의 본체를 통째로 버린다. 비공개 여부는 meta.is_private
  --    로 넘겨서 화면에서 구분한다.
  c.project_id IS NOT NULL
  AND (
    c.date_created >  STR_TO_DATE('{{ $("cursor").first().json.ts || "2000-01-01T00:00:00Z" }}', '%Y-%m-%dT%H:%i:%sZ')
    OR (c.date_created = STR_TO_DATE('{{ $("cursor").first().json.ts || "2000-01-01T00:00:00Z" }}', '%Y-%m-%dT%H:%i:%sZ')
        AND c.id > {{ $("cursor").first().json.id || 0 }})
  )
  AND c.date_created < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE)   -- 핫엣지 가드

ORDER BY c.date_created ASC, c.id ASC
LIMIT 200;
