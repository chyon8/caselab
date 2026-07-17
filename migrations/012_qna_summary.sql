-- 개발사 Q&A 요약 (ⓒAI 파생 필드) — 노이즈 제거 + 핵심질문/결정/리스크/키워드
-- 원본은 timeline_events(source='qna')에 그대로 보존. 이 컬럼은 재추출 시 덮어써도 됨.
-- 형태: { key_questions:[], decisions:[], risk_signals:[], keywords:[], noise_dropped:int }
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS qna_summary JSONB;
