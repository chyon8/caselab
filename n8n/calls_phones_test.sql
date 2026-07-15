-- [테스트 전용] calls_phones.sql 의 축소판 — 최근 수정된 프로젝트 50건의 전화번호만 뽑는다.
-- 목적: 파이프라인(①본진조회 → ②통화API → ③펼치기/스크럽 → ④CaseLab 적재)이
--       끝까지 도는지, calls 테이블에 실제로 붙는지 소규모로 먼저 확인.
-- ⚠️ 운영(전체 백필/동기화)용은 calls_phones.sql 을 그대로 쓴다. 이 파일은 검증 후 버려도 된다.
--
-- "최근 것 50개"의 기준: pp.date_modified 가 가장 최근인 프로젝트들의 전화번호.
--   전화번호 하나가 client·partner UNION 여러 프로젝트에 걸쳐 나올 수 있어, 번호별로
--   가장 최근 date_modified 하나만 남긴 뒤 그 최근순으로 50개를 자른다.
-- ⚠️ 본진이 MariaDB 라 Postgres 전용 DISTINCT ON 대신 ROW_NUMBER() 윈도우 함수로 중복 제거한다.

SELECT phone FROM (
  SELECT phone, latest,
         ROW_NUMBER() OVER (PARTITION BY phone ORDER BY latest DESC) AS rn
  FROM (
    SELECT m.client_cell_phone_number AS phone, pp.date_modified AS latest
    FROM meeting_meeting m
    JOIN project_project pp
      ON pp.id = m.project_id
     AND pp.date_start_recruitment >= '2024-11-11 00:00:00'
     AND pp.status IN ('recruiting', 'close_recruiting', 'contracted', 'completed')
     AND pp.project_type = 'task_based'
    WHERE m.client_cell_phone_number IS NOT NULL AND m.client_cell_phone_number <> ''

    UNION ALL

    SELECT m.partner_cell_phone_number AS phone, pp.date_modified AS latest
    FROM meeting_meeting m
    JOIN project_project pp
      ON pp.id = m.project_id
     AND pp.date_start_recruitment >= '2024-11-11 00:00:00'
     AND pp.status IN ('recruiting', 'close_recruiting', 'contracted', 'completed')
     AND pp.project_type = 'task_based'
    WHERE m.partner_cell_phone_number IS NOT NULL AND m.partner_cell_phone_number <> ''
  ) t
) ranked
WHERE rn = 1
ORDER BY latest DESC
LIMIT 50;
