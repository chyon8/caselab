-- 검수 세션 — 매니저가 검수 한 건을 진행하며 만든 것들을 CaseLab이 보관한다.
-- 지금까지 전 과정이 stateless(localStorage 한 칸)라, 프로젝트 두 건을 번갈아 보면 덮어써졌다.
--
-- 설계 메모:
--  * project_id는 nullable — 의뢰 원문을 붙여넣는 흐름이라 CaseLab이 project를 알 방법이 없다.
--    공고가 올라간 뒤 사후 매칭용으로 자리만 둔다. **projects(id)에 FK를 걸면 안 된다**:
--    검수 대상은 status='submitted'라 CaseLab projects 테이블(모집 이후만 동기화)에 없다.
--  * 녹취 원문은 저장하지 않는다(사용자 결정) — call_id와 요약만. 원문이 필요하면 통화 API로
--    재조회한다. 원천에 남아 있는 걸 복제하지 않으니 "녹취 속 사람 이름" PII 문제가 생기지 않는다.
--  * 한 세션 = 한 행, 덮어쓰기. 화면의 "새 검수"를 눌러야 새 행이 생긴다(사용자 결정).
--    분석을 다시 돌릴 때마다 행이 쌓이면 목록이 금방 쓰레기로 찬다.
CREATE TABLE IF NOT EXISTS review_session (
  id             BIGSERIAL PRIMARY KEY,
  title          TEXT,                      -- 목록 구분용. 브리핑 한 줄 정의를 자동으로 넣는다
  project_id     BIGINT,                    -- 사후 매칭용. FK 없음(위 메모)
  manager_email  TEXT NOT NULL,             -- 세션 쿠키의 로그인 이메일
  source_text    TEXT NOT NULL,             -- 의뢰 원문
  analysis       JSONB,                     -- 브리핑·질문·스코어·견적·유사사례·검수팁·재배치
  call_ids       BIGINT[],                  -- 고른 통화 id
  call_summaries JSONB,                     -- 고른 통화의 요약만 (원문은 저장 안 함)
  draft          JSONB,                     -- 공고문 초안
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 목록은 항상 "내 것, 최근 순"으로만 읽는다
CREATE INDEX IF NOT EXISTS idx_review_session_manager
  ON review_session (manager_email, updated_at DESC);
