-- 개인별 관심(즐겨찾기) — 로그인 이메일 단위 (2026-08-11)
--
-- 목록의 ★ 버튼과 "★ 관심" 필터는 이미 있었지만 상태가 AppContext의 useState 한 칸이라
-- 새로고침하면 사라지고 로그인 계정과도 무관했다. 이 테이블이 그 상태의 저장소다.
--
-- 설계 메모:
--  * projects(id)에 FK를 걸지 않는다 — projects는 본진에서 동기화로 채우는 테이블이라
--    아직 안 들어온 id를 별표할 수 있다. 사라진 id는 목록 조회에서 자연히 빠진다.
--  * 한 사람이 같은 프로젝트를 두 번 담을 일은 없다 → (이메일, 프로젝트) 복합 PK.
--    조회는 항상 "내 것 전부"라 PK 앞부분(manager_email)만으로 충분해 별도 인덱스는 없다.
CREATE TABLE IF NOT EXISTS favorite (
  manager_email TEXT        NOT NULL,   -- 세션 쿠키의 로그인 이메일
  project_id    BIGINT      NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (manager_email, project_id)
);
