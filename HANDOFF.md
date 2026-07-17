# CaseLab 세션 핸드오프 — 여기부터 읽으세요

> 새 세션 시작 시 이 파일 먼저. 최종 업데이트: **2026-07-17**
> 제품/도메인 기준 문서는 CLAUDE.md §5-1 표 참조(design.md·SCORING_SPEC.md·DATA_SCHEMA.md 등).
> 상세 진단·결정·백로그는 [NEXT_STEPS.md](./NEXT_STEPS.md).

**CaseLab** = 위시켓 검수 매니저용 프로젝트 인텔리전스 대시보드. 목표: ①새 프로젝트 검수 시 과거 유사사례의 리스크·개발지식 활용, ②핸드오프 후 무슨 일이 있었는지(상태·미팅·예산·과업 변경) 추적.

---

## ✅ 현재 완료·가동 중

- **데이터 파이프라인**(Neon + n8n push): projects 6,032건, qna 16,717건, 미팅 녹취(`meetings`), 타임라인 이벤트. `CASELAB_DATA_SOURCE=postgres`.
- **목록 서버 페이지네이션 + 정밀검색(L1)** — trigram, 제목·공고본문·고객사·기술·카테고리, 토큰 AND·필드 OR.
- **타임라인 생애주기 마일스톤 시딩**, 모집/미팅 분리, "계약체결중" 라벨.
- **🆕 개발사 Q&A AI 요약** (gpt-4o-mini) — 4,384/4,384 전량. 노이즈 제거 + 핵심질문/결정/리스크/키워드. 상세보기 요약 블록 + 빈 상태 UI.
- **🆕 L2 유사사례 임베딩** (text-embedding-3-large, 1536d) — 6,032/6,032 전량. 상세보기 "유사 프로젝트" 패널(pgvector 코사인). 유사도 검색 실증됨.

> 🆕 두 항목 상세(스크립트·모델·운영)는 CLAUDE 메모리 [[ai-enrichment-pipeline]] 및 아래 "운영 스크립트".

## 🔜 다음 착수 (블로커 없음)

1. **공고문 붙여넣기 검색** (query-by-example) — L2의 메인 표면. `POST /api/similar {text}` → 같은 모델+`dimensions:1536` 즉석 임베딩 → 공유 벡터코어(`getSimilarProjects`를 벡터 파라미터로 리팩터). **UI: 메인 검색에 모드토글(키워드/공고문) + 큰 textarea.** 추천: 이것만, 키워드+의미 조합은 안 함.
2. **cron 스케줄** (Vercel Cron, 하루 1회) — 신규 유입분 자동 임베딩·qna 재추출. **미설정.** (n8n 동기화 스케줄도 미설정.) qna 재추출 트리거 = 날짜 아닌 **"qna 개수 변화"** 기준(백필분이 옛 날짜로 들어오므로).

## ⚠️ 블로커 / 대기 / 잊지 말 것

- **OpenAI 키 노출** — 채팅에 붙여넣어짐(2026-07-17). **rotate 필요.** 키는 `.env.local`(gitignored) `OPENAI_API_KEY`에만.
- **미커밋: L2 UI** — 커밋 대기:
  ```bash
  git add src/data/types.ts src/data/source.ts src/data/postgres.ts \
          src/app/projects/\[id\]/page.tsx \
          src/features/projects/ProjectDetail.tsx \
          src/features/projects/ProjectDetail.module.css
  git commit -m "feat: 상세보기 L2 유사 프로젝트 패널"
  git push origin main
  ```
- **AI 프롬프트(ⓒAI 필드)** — 리스크태그·이슈로그·미팅요약은 사용자 검토까지 보류(단 qna 요약은 승인·완료).
- **Q&A 유실 346건** — n8n ③→④ 배치 매핑 버그로 진단됨("안 돌려서"가 아님). 내부망 필요. NEXT_STEPS "⓪".
- **계약금액 0원 건 정체** — 운영팀 확인 중.

## 🔧 운영 스크립트

```bash
node scripts/extract-qna.mjs [N]      # qna 요약 추출 (qna_summary IS NULL만, 멱등)
node scripts/embed-projects.mjs [N]   # 공고문 임베딩 (embedding IS NULL만, 멱등, 429 재시도)
```
둘 다 이미 처리된 건 자동 스킵 → 재실행하면 신규분만. 원본(`timeline_events`)은 불변, 파생만 갱신.

## 작업 규칙

git은 AI가 직접 실행 안 함, 복붙 명령어만(CLAUDE.md §6). 변경 리포트+체크리스트+컨펌 후 커밋. 원격 origin = github.com/chyon8/caselab. dev 서버는 사용자가 3000포트로 띄움.
