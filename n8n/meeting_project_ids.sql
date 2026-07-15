-- 미팅 녹취 조회용 in-scope project_id 목록 (사내망 n8n 내부 전용)
--
-- /api/meetings/?project_id= 를 프로젝트마다 호출하기 위한 id 목록이다.
-- by-phone(calls_phones.sql)의 전화번호 UNION 이 필요 없다 — 미팅 API 는 project_id 로 바로 조회된다.
--
-- ⚠️ 범위 축소: 녹취는 2026-04 부터 쌓이기 시작했다. 그 이전에 완료돼 죽은 프로젝트를
--    조회해봐야 결과가 없다 → date_modified 하한선(오늘-60일 롤링 윈도우)으로 자른다.
--    모집일이 아니라 수정일 기준인 이유: 2025 에 모집했어도 지금 진행 중이면 최근 미팅이 생기므로 살린다.
--
-- ⚠️ meetings API 에 since 파라미터가 없어 진짜 증분은 불가능하다 — 대신 매 실행마다 대상 프로젝트
--    목록을 작게 유지해 재실행 비용만 낮춘다. 이미 받은 미팅을 또 조회해도 CaseLab 이 id 로 upsert 하니 무해.

SELECT pp.id AS project_id
FROM project_project pp
WHERE pp.date_start_recruitment >= '2024-11-11 00:00:00'
  AND pp.status IN ('recruiting', 'close_recruiting', 'contracted', 'completed')
  AND pp.project_type = 'task_based'
  AND pp.date_modified >= '{{ $now.minus({days: 60}).toFormat('yyyy-MM-dd') }}';
