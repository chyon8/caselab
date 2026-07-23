-- 미팅 녹취 조회용 in-scope 목록 + 스캔 워터마크 (사내망 n8n 내부 전용)
--
-- meetings_pipeline.md 의 ③ 본진조회 노드에 붙여넣는 쿼리다.
-- /api/meetings/?project_id= 를 프로젝트마다 호출하기 위한 project_id 를 낸다.
-- by-phone(calls_phones.sql)의 전화번호 UNION 이 필요 없다 — 미팅 API 는 project_id 로 바로 조회된다.
--
-- ⚠️ 범위 축소: project_project 만 보고 date_modified 로 자르면 안 된다 —
--    date_modified(프로젝트 레코드 수정 시각)는 "새 미팅이 생겼다"와 무관해서, 어제 미팅이
--    잡혔어도 프로젝트 로우를 아무도 안 건드렸으면 과거 값 그대로라 대상에서 통째로 누락된다
--    (실제로 project 156571 이 이 이유로 빠졌었다). → meeting_meeting 을 직접 JOIN 해
--    "최근 60일 안에 실제 미팅이 있는" 프로젝트만 남긴다.
--
-- ⚠️ meetings API 에 since 파라미터가 없어 진짜 증분은 불가능하다 — 매 실행마다 60일 윈도우를
--    통째로 재스캔한다. 이미 받은 미팅을 또 조회해도 CaseLab 이 id 로 upsert 하니 무해(행 수 안 늘어남).
--    m.date_created(예약 시각)로 커서를 걸어 증분화하고 싶어도, STT 전문 생성 시각과 며칠씩
--    어긋나 늦게 생성된 전문을 놓친다 → 재스캔이 의도적 방어다.
--
-- ⚠️ event_cursor_at/id 는 ⑧ 코드 노드가 스캔 워터마크(sync_state 커서)로 쓴다. ORDER BY 로
--    마지막 행이 최댓값이 되게 보장한다. 이 커서는 표시용에 가깝다 — ③ WHERE 절이 커서를
--    참조하지 않으므로(매번 전량 재스캔) 커서가 앞질러 가도 유실이 없다.

SELECT
  pp.id          AS project_id,
  m.date_created AS event_cursor_at,
  m.id           AS event_cursor_id
FROM project_project pp
JOIN meeting_meeting m
  ON m.project_id = pp.id
 AND m.method <> 8                                          -- 8 = '미팅 없음' 제외
 AND m.date_created >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 DAY)
WHERE pp.date_start_recruitment >= '2024-11-11 00:00:00'
  AND pp.status IN ('recruiting', 'close_recruiting', 'contracted', 'completed')
  AND pp.project_type = 'task_based'
ORDER BY m.date_created ASC, m.id ASC;
