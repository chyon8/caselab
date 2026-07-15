-- 통화 API 조회용 전화번호 목록 (사내망 n8n 내부 전용)
-- ⚠️ 이 전화번호는 통화 API 호출에만 쓰고 CaseLab 으로는 절대 forward 하지 않는다.
--    (DATA_INTEGRATION §104 — 전화번호는 n8n 밖으로 안 나간다)
--
-- meeting_meeting 의 클라이언트·파트너 연락처를 in-scope 프로젝트만 뽑는다.
-- → n8n 이 이 전화번호들로 GET /api/calls/by-phone/ 를 행마다 호출한다.
--
-- ⚠️ 전화번호 하나당 한 행으로 낸다 (client·partner UNION). 그래야 n8n 통화 API 노드가
--    "행 하나 = API 호출 한 번" 으로 자동 반복한다. DISTINCT 로 같은 번호 중복 호출을 막는다.
--    project_id·user_type 은 여기서 안 실어도 된다 — 통화 API 응답에 이미 들어 있다.
--
-- ⚠️ 범위 축소 (2026-07-15): 녹취는 2026-04 부터 쌓이기 시작했다. 그 이전에 완료돼 죽은 프로젝트를
--    조회해봐야 결과가 없다 → date_modified 하한선으로 자른다 ("최근에 움직인 프로젝트만").
--    모집일이 아니라 수정일 기준인 이유: 2025 에 모집했어도 지금 진행 중이면 최근 통화가 생기므로 살려야 한다.
--    완료돼 안 움직이는 프로젝트는 자동으로 빠진다 (완료 상태 필터를 따로 걸 필요 없음).
--
-- ⚠️ 하한선 = 고정 날짜가 아니라 "오늘 - 60일" 롤링 윈도우 (n8n Luxon 표현식, 아래 쿼리에 이미 반영).
--    by-phone API 에 since 파라미터가 없어 진짜 증분은 불가능하다 — 대신 매 실행마다 번호 목록 자체를
--    작게 유지해서 재실행 비용을 낮춘다. 이미 받은 통화를 또 조회해도 CaseLab 이 id 로 upsert 하니 무해하다.
--    백필과 정기 실행 모두 이 롤링 윈도우 그대로 쓴다 (녹취 자체가 최근 ~2개월치만 존재).

SELECT DISTINCT phone FROM (
  SELECT m.client_cell_phone_number AS phone
  FROM meeting_meeting m
  JOIN project_project pp
    ON pp.id = m.project_id
   AND pp.date_start_recruitment >= '2024-11-11 00:00:00'
   AND pp.status IN ('recruiting', 'close_recruiting', 'contracted', 'completed')
   AND pp.project_type = 'task_based'
   AND pp.date_modified >= '{{ $now.minus({days: 60}).toFormat('yyyy-MM-dd') }}'
  WHERE m.client_cell_phone_number IS NOT NULL

  UNION

  SELECT m.partner_cell_phone_number AS phone
  FROM meeting_meeting m
  JOIN project_project pp
    ON pp.id = m.project_id
   AND pp.date_start_recruitment >= '2024-11-11 00:00:00'
   AND pp.status IN ('recruiting', 'close_recruiting', 'contracted', 'completed')
   AND pp.project_type = 'task_based'
   AND pp.date_modified >= '{{ $now.minus({days: 60}).toFormat('yyyy-MM-dd') }}'
  WHERE m.partner_cell_phone_number IS NOT NULL
) t
WHERE phone <> '';
