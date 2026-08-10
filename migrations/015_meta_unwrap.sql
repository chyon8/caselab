-- timeline_events.meta 이중 인코딩 해제 (2026-08-10)
--
-- 본진 SQL의 JSON_OBJECT(...)가 n8n MySQL 노드를 거치며 JSON "문자열"로 도착하는데,
-- 수신 라우트가 그걸 한 번 더 JSON.stringify 해서 jsonb에 문자열 타입 값이 들어갔다.
--   저장된 값:  "{\"by\": \"hunix123\", \"is_private\": false}"   ← jsonb_typeof = 'string'
--   기대한 값:  {"by": "hunix123", "is_private": false}          ← jsonb_typeof = 'object'
--
-- 그래서 meta->>'by' 가 항상 NULL 이었다. 눈에 띄는 증상:
--   * Q&A "비공개" 배지가 한 번도 뜨지 않았다 (실제로는 18,494건 중 16,939건 = 92%가 비공개)
--   * Q&A 작성자가 빈 값
--   * refresh.ts 의 qna 요약이 by 를 못 실었다
--
-- 라우트는 같은 커밋에서 고쳤다(metaJson). 이건 이미 들어간 행을 푸는 1회성 정리다.
-- #>> '{}' 는 jsonb 문자열의 알맹이 텍스트를 꺼낸다 → 다시 jsonb 로 캐스팅하면 객체가 된다.
-- jsonb_typeof = 'string' 인 행만 건드리므로 여러 번 실행해도 안전하다(멱등).
UPDATE timeline_events
   SET meta = (meta #>> '{}')::jsonb
 WHERE meta IS NOT NULL
   AND jsonb_typeof(meta) = 'string';
