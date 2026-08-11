-- 공고문 임베딩 클러스터 (2026-08-11)
--
-- category(대분류 10여 종)는 "웹사이트 개발"처럼 굵어서, 같은 카테고리 안에 성격이 전혀 다른
-- 프로젝트가 섞인다. 임베딩으로 실제 유형을 갈라내면 category보다 세밀한 단위로 계약률을 볼 수 있다.
--
-- 클러스터는 오프라인 k-means로 한 번 만든다(scripts/cluster-projects.mjs).
-- centroid를 테이블에 남겨두는 이유: 신규 프로젝트를 **재클러스터링 없이** 최근접 중심으로
-- 배정하기 위해서다(refresh.ts 5단계). 다시 돌리면 라벨·경계가 바뀌므로 자주 돌리지 않는다.
CREATE TABLE IF NOT EXISTS clusters (
  id       SMALLINT PRIMARY KEY,     -- k-means 클러스터 번호 (재실행하면 같은 번호에 다른 유형이 올 수 있다)
  label    TEXT NOT NULL,            -- LLM이 대표 공고 제목들을 보고 붙인 유형명
  centroid VECTOR(1536) NOT NULL,    -- 신규 배정 기준. projects.embedding과 같은 공간(3-large, 1536d)
  size     INT NOT NULL,             -- 구축 시점 소속 건수 (이후 배정분은 반영 안 됨 — 현재 건수는 projects를 센다)
  built_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS cluster_id SMALLINT REFERENCES clusters(id);
CREATE INDEX IF NOT EXISTS idx_projects_cluster ON projects (cluster_id);
