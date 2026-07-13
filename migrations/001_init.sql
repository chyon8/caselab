-- CaseLab 초기 스키마 (DATA_INTEGRATION.md §4)
-- 적용: Neon 콘솔 SQL 에디터에 그대로 붙여넣기 (또는 psql $DATABASE_URL -f migrations/001_init.sql)

CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector: 유사사례 검색 (같은 DB, 별도 벡터DB 없음)

-- 본진 스냅샷 (미러) + 임베딩
CREATE TABLE IF NOT EXISTS projects (
  id                 BIGINT PRIMARY KEY,        -- project_project.id 그대로
  title              TEXT NOT NULL,
  client_name        TEXT,
  category           TEXT,
  tech               TEXT,
  budget             NUMERIC,                   -- 현재 예산 (본진 최신값, 원 단위)
  term_days          INT,                       -- 현재 기간
  initial_budget     NUMERIC,                   -- 등록 시 원본 (projectinitialvalue) — 변경 추적 기준
  initial_term_days  INT,
  status             TEXT NOT NULL,             -- CaseLab 6단계
  stage              SMALLINT NOT NULL,
  inspection_manager TEXT,
  manager_ids        JSONB,                     -- 관여 매니저 전체 (visibility)
  contract_amount    NUMERIC,
  contract_term_days INT,
  deadline_at        TIMESTAMPTZ,               -- project_project.date_deadline (모집 마감 — 변경 추적 대상, §5)
  cancel_stage       TEXT,
  cancel_reason      TEXT,
  posting_raw        TEXT,                      -- description 원문
  content_hash       TEXT,                      -- 임베딩 대상 텍스트의 해시 (재임베딩 판단 기준)
  embedding          VECTOR(1536),              -- NULL이면 미처리 (백필 재개 기준)
  embedding_model    TEXT,                      -- 모델 교체 시 재임베딩 대상 식별
  embedded_at        TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ,               -- 본진 소프트삭제 반영 (행은 보존, 목록에서 숨김)
  hidden             BOOLEAN NOT NULL DEFAULT false,  -- management_hide 반영
  source_modified_at TIMESTAMPTZ,               -- 본진 date_modified
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_projects_modified ON projects (source_modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects (status);
-- 전화번호는 저장하지 않음 — CaseLab으로 전송 자체가 안 됨 (§3)

-- 타임라인 이벤트 (여러 원본 + 자동 생성 이벤트 통합)
CREATE TABLE IF NOT EXISTS timeline_events (
  id         BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id),
  source     TEXT NOT NULL,      -- 'managenote'|'meeting'|'contract'|'milestone'|'qna'
                                 -- |'status'(상태 전환, 서버 생성)|'change'(예산·기간 등 변경, 서버 생성)
  source_id  TEXT NOT NULL,      -- 원본 PK 또는 서버 생성 키 (멱등성)
  event_at   TIMESTAMPTZ NOT NULL,
  stage      TEXT,
  title      TEXT,
  body       TEXT,
  meta       JSONB,              -- change: {field, before, after} / qna: {by, at_stage}
  UNIQUE (source, source_id)
);
CREATE INDEX IF NOT EXISTS idx_timeline_project ON timeline_events (project_id, event_at);

-- 통화 요약 (PII 없음: 전화번호·원문 미수신)
CREATE TABLE IF NOT EXISTS calls (
  id             BIGINT PRIMARY KEY,   -- 통화 API의 id
  project_id     BIGINT REFERENCES projects(id),
  call_type      TEXT,
  call_time_secs INT,
  summary        TEXT,                 -- 통화 API 제공 요약 (별도 LLM 비용 0)
  drive_url      TEXT,                 -- 원문 필요 시 이 링크로만 접근 (사내 권한)
  created_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_calls_project ON calls (project_id, created_at);

-- 완료 리뷰 (CaseLab 고유)
CREATE TABLE IF NOT EXISTS reviews (
  project_id BIGINT PRIMARY KEY REFERENCES projects(id),
  checks     BOOLEAN[] NOT NULL,
  comment    TEXT,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI 산출물 (프롬프트 검토 후 — 스키마만 선반영)
CREATE TABLE IF NOT EXISTS ai_insights (
  project_id         BIGINT PRIMARY KEY REFERENCES projects(id),
  risk_tags          TEXT[],
  issue_log          JSONB,   -- [{type, date, src, text}]
  meeting_summary    JSONB,   -- [{meeting_id, bullets[]}]
  posting_structured JSONB,
  model              TEXT,
  generated_at       TIMESTAMPTZ
);

-- 소스별 동기화 커서 — 커서의 단일 진실(single source of truth)
CREATE TABLE IF NOT EXISTS sync_state (
  source       TEXT PRIMARY KEY,   -- 'projects'|'managenote'|'meetings'|'qna'|'calls'
  cursor_value TEXT,               -- 복합 커서: "2026-07-10T12:00:00Z|154234" (ts|id)
  last_run_at  TIMESTAMPTZ
);
