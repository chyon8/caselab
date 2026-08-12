-- 임베딩 클러스터(k=16) 폐기 잔재 정리 (2026-08-12 반려, 018 삭제됨)
-- 공고 전체를 한 벡터로 누르면 "무슨 분야인가"가 지배해 대분류가 되고,
-- 왜 지원자가 없었는지가 통째로 사라진다. 읽는 코드는 이미 전부 제거됨.
ALTER TABLE projects DROP COLUMN IF EXISTS cluster_id;
DROP TABLE IF EXISTS clusters;
