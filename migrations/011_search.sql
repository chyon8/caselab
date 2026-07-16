-- 검색 L1 (정밀 키워드 검색) — trigram 기반 부분일치
--
-- 형태소 분석기 대신 trigram(pg_trgm)을 쓴다: 한글 조사가 붙어도 부분일치되도록
-- ("쇼핑몰" 검색 → "쇼핑몰을" 매칭). 설계 근거는 search-architecture 메모.
--
-- ⚠️ 이 인덱스는 성능용이다. 없어도 ILIKE 검색은 동작한다(seqscan이라 느릴 뿐).
--    공고 본문(posting_raw)이 제일 큰 검색 대상이라 GIN trigram으로 seqscan을 막는다.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_projects_posting_raw_trgm
  ON projects USING gin (posting_raw gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_projects_title_trgm
  ON projects USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_projects_client_trgm
  ON projects USING gin (client_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_projects_tech_trgm
  ON projects USING gin (tech gin_trgm_ops);
