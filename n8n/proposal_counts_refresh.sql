-- CaseLab 지원수 리프레시 — 모집중 프로젝트만 (커서 없음)
-- 본진 조회 엔드포인트: POST http://wishket-api-server:8001/query
-- 수신: POST /api/sync/proposal-counts
--
-- ⚠️ 왜 별도 워크플로인가
--   본진 project_project.date_modified 는 지원이 들어와도 갱신되지 않는다. 그래서
--   date_modified 커서 기반인 projects 워크플로(projects_incremental.sql)는 모집중인 행을
--   다시 조회하지 않고, proposal_count 가 마지막 동기화 시점 값에 고정된다.
--   (2026-07-29 실측: 모집 마감 전 65건 중 36건이 모집 전환 시점 값 그대로, 그중 16건이 0.
--    projects_incremental.sql 의 "지원이 들어오면 date_modified 도 갱신된다 98.9%" 주석은 틀렸다.)
--   → 이 쿼리는 커서를 쓰지 않고 모집중인 건을 매번 전량 다시 읽는다.
--
-- ⚠️ 커서를 저장하지 않는다. 여기서 읽는 행의 date_modified 는 projects 커서보다 과거라,
--   저장하면 증분 동기화가 뒤로 밀려 같은 구간을 반복 처리한다. 수신 라우트도 sync_state 를
--   건드리지 않는다.
--
-- 페이로드는 id + 정수 두 컬럼뿐이라 500건이라도 수십 KB — Vercel 4.5MB 한도와 무관하다.

SELECT
  pp.id,
  pp.proposal_count

FROM project_project pp

WHERE
  -- 모집 단계인 건만. 계약·진행·완료로 넘어갈 때는 date_modified 가 갱신되므로
  -- 기존 projects 워크플로가 최종값을 정확히 실어온다 (실측으로 확인).
  --   · close_recruiting(모집 마감) 도 포함 — 마감 직전 들어온 지원까지 확정하기 위해.
  pp.status IN ('recruiting', 'close_recruiting')
  -- 대상 범위는 projects_incremental.sql 과 동일하게 유지한다
  AND pp.project_type = 'task_based'
  AND pp.date_start_recruitment >= '2024-11-11 00:00:00'
  -- 삭제된 건은 지원수를 갱신할 이유가 없다 (삭제 마킹은 projects 워크플로 담당)
  AND pp.date_deleted IS NULL

-- ⚠️ LIMIT 은 수신 라우트의 MAX_BATCH(500)와 같다. 대상이 500건을 넘으면 조용히 잘린다.
--    최근 모집 시작 순으로 정렬해, 잘릴 때 지원이 이미 멎은 오래된 건부터 빠지게 한다.
--    (2026-07-29 기준 대상 ~286건.) 응답이 계속 500건이면 페이지네이션을 붙여야 한다.
ORDER BY pp.date_start_recruitment DESC
LIMIT 500;
