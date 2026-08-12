-- 취소 사유 태그 · 공급난이도 트레이트 (2026-08-12)
--
-- 018(임베딩 클러스터)을 대체한다. k=16 클러스터는 "쇼핑몰 구축", "매칭 플랫폼"처럼 굵어서
-- 정작 "사방넷·파스토(3PL) 통합관리 초기 설정"이 왜 지원자를 못 모았는지를 통째로 감췄다.
-- 대분류로 묶는 순간 인사이트가 0이 된다 — 그래서 **묶는 축 자체를 바꾼다.**
--
-- cancel_tags  : 매니저 노트에서 뽑은 **왜 깨졌나**. 개발사 Q&A의 risk_tags와는 다른 질문이다
--                (실측: 리스크 지적 있음 28.1% vs 없음 29.8% — Q&A 리스크는 결과를 예측 못 한다).
-- supply_tags  : 공고 내용이 **개발사 공급 풀을 얼마나 좁히는가**. 상주 조건·레거시 스택·회로 설계처럼
--                난이도가 아니라 "붙을 수 있는 회사가 몇이나 되나"를 가르는 성질.
ALTER TABLE ai_insights
  ADD COLUMN IF NOT EXISTS cancel_tags TEXT[],
  ADD COLUMN IF NOT EXISTS supply_tags TEXT[];

-- 트레이트별 저지원 비율을 뽑을 때 전량을 훑는다 — 배열 포함 검색용
CREATE INDEX IF NOT EXISTS idx_ai_supply_tags ON ai_insights USING GIN (supply_tags);
CREATE INDEX IF NOT EXISTS idx_ai_cancel_tags ON ai_insights USING GIN (cancel_tags);
