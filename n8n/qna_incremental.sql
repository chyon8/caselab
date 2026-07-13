-- CaseLab 증분 동기화 — Q&A (개발사 문의 댓글)
-- 본진: comment_projectcomment (+ comment_commentreply 답글)
-- 수신: POST /api/sync/timeline   (source='qna')
--
-- ⚠️ projects 워크플로가 먼저 돌아야 한다. 프로젝트가 아직 CaseLab에 없으면
--    그 댓글은 skip으로 반환되고 커서가 전진하지 않아 다음 주기에 재시도된다.
--
-- ⚠️ PII: 작성자는 실명이 아니라 계정명만 가져온다. 이메일·전화번호는 SELECT하지 않는다.
--
-- 커서 주입 (n8n 표현식) — source는 'qna':
--   {{TS}} = $('cursor').item.json.ts || '2025-07-13T00:00:00Z'
--   {{ID}} = $('cursor').item.json.id || 0

SELECT
  c.project_id,
  'qna'                                            AS source,
  c.id                                             AS source_id,
  DATE_FORMAT(c.date_created, '%Y-%m-%dT%H:%i:%sZ') AS event_at,
  c.body                                           AS title,   -- 질문 본문 (CaseLab의 qna.q)

  -- 답글이 있으면 본문에 이어붙인다 (별도 이벤트로 쪼개지 않는다)
  (SELECT GROUP_CONCAT(r.body SEPARATOR '\n---\n')
     FROM comment_commentreply r
    WHERE r.comment_id = c.id AND r.status = 1)    AS body,

  JSON_OBJECT(
    'by', (SELECT u.username FROM auth_user u WHERE u.id = c.user_id),
    'reply_count', (SELECT COUNT(*) FROM comment_commentreply r
                     WHERE r.comment_id = c.id AND r.status = 1)
  )                                                AS meta

FROM comment_projectcomment c

WHERE
  c.status = 1               -- 공개 댓글만 (0은 비공개)
  AND c.project_id IS NOT NULL
  AND (
    c.date_created >  STR_TO_DATE('{{TS}}', '%Y-%m-%dT%H:%i:%sZ')
    OR (c.date_created = STR_TO_DATE('{{TS}}', '%Y-%m-%dT%H:%i:%sZ') AND c.id > {{ID}})
  )
  AND c.date_created < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE)   -- 핫엣지 가드

ORDER BY c.date_created ASC, c.id ASC
LIMIT 200;
