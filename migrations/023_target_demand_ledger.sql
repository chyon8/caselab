-- 공고 기반 타깃 후보 분석의 분류 원장. 공고 1건 = 1행이며, 같은 unit_id끼리 고유 수요 1건이다.
-- 원본은 .private/target-demand/에 있고 scripts/target-demand-v2-load.mjs가 통째로 다시 적재한다.
-- 배포 환경과 다른 PC에서도 같은 원장을 읽기 위해 둔다. 고객 식별자는 저장하지 않는다.

CREATE TABLE IF NOT EXISTS target_demand_ledger (
  project_id         BIGINT PRIMARY KEY,
  unit_id            BIGINT NOT NULL,   -- 대표 공고 id
  status             TEXT NOT NULL,     -- group | single | ambiguous | excluded
  industry           TEXT,
  problem            TEXT,
  system             TEXT,
  industry_group     TEXT,
  system_type        TEXT,
  group_key          TEXT,              -- "업종군 × 시스템 유형"
  detail_key         TEXT,              -- "업종 × 업무 × 시스템"
  reason             TEXT,
  evidence_industry  TEXT,              -- 원문 근거 (공고별)
  evidence_problem   TEXT,
  evidence_system    TEXT,
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_target_demand_ledger_unit ON target_demand_ledger (unit_id);
