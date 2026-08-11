# CaseLab 세션 핸드오프 — 여기부터 읽으세요

> 새 세션 시작 시 이 파일 먼저. 최종 업데이트: **2026-08-11**
> 제품/도메인 기준 문서는 CLAUDE.md §5-1 표 참조(design.md·SCORING_SPEC.md·DATA_SCHEMA.md 등).
> 상세 진단·결정·백로그는 [NEXT_STEPS.md](./NEXT_STEPS.md).
> 이 파일은 로컬 메모리가 아니라 git으로 관리 — 집/회사 어느 머신에서 세션을 열어도 여기서 이어간다.

**CaseLab** = 위시켓 검수 매니저용 프로젝트 인텔리전스 대시보드. 목표: ①새 프로젝트 검수 시 과거 유사사례의 리스크·개발지식 활용, ②핸드오프 후 무슨 일이 있었는지(상태·미팅·예산·과업 변경) 추적.

---

## ✅ 현재 완료·가동 중

### 데이터 파이프라인 (Neon + n8n push)

| 소스 | 적재량 | 상태 |
|---|---|---|
| `projects` | 6,183 | 가동 |
| `timeline_events` (qna) | 18,495 | 가동 |
| `timeline_events` (managenote) | 5,170 / 648 프로젝트 | **2026-08-10 신규 가동** |
| `meetings` (사전 미팅 녹취) | 134 | 가동 |
| `meetings`/`status`/`change` 이벤트 | — | 가동 |

`CASELAB_DATA_SOURCE=postgres`. 커서는 CaseLab이 소유(`sync_state`)하므로 n8n은 무상태.

### AI 파생 (전부 `gpt-4o-mini`)

| 무엇 | 저장 위치 | 커버리지 |
|---|---|---|
| 개발사 Q&A 요약 | `ai_insights.qna_summary` | 4,535 |
| 공고문 임베딩 (L2) | `projects.embedding` (3-large, 1536d) | 6,032 |
| **사전 미팅 녹취 추출** | `meetings.ai_extract` | **133/134** (1건은 92자 껍데기, 대상 제외) |
| **매니저 노트 추출** | `ai_insights.note_extract` | **646/647** |
| **리스크 태그(고정 15종)** | `ai_insights.risk_tags` | **1,583** (리스크 문장이 있는 프로젝트 전량) |
| **공고문 유형 클러스터** | `projects.cluster_id` + `clusters` | **6,193 / 16개 유형** |

**Vercel Cron이 신규분을 자동으로 따라간다** — [`src/lib/refresh.ts`](./src/lib/refresh.ts), 하루 3회(09:30·13:00·17:00 KST). 6단계: ①qna 요약 40 ②임베딩 60 ③미팅 추출 6 ④노트 추출 30 ⑤리스크 태깅 40 ⑥클러스터 배정 500(LLM 없음, SQL 한 문장). 대상 조건이 전부 `추출 없음 OR 원본이 바뀜`이라 **놓치지도 중복하지도 않고, 실패해도 다음 실행에 재시도된다.** 급하면 설정 → "지금 갱신"(`/api/refresh-now`, 같은 함수).

> qna 요약이 다시 뽑히면 그 프로젝트의 `risk_tags`를 **NULL로 되돌린다** — 태그는 옛 문장에 붙은 것이라 그대로 두면 거짓말이 된다. ⑤가 NULL을 대상으로 잡으므로 다음 실행에 알아서 다시 태깅된다.

> ⚠️ **cron은 DB에 이미 들어와 있는 것만 가공한다.** 적재는 n8n 몫이다 — n8n 스케줄이 안 걸려 있으면 새 데이터가 안 들어오고, cron은 할 일이 없다.

### 화면 · 기능

- **목록 서버 페이지네이션 + 정밀검색(L1)** — trigram, 관련도 정렬. 모바일 대응.
- **타임라인 생애주기 마일스톤 시딩**, 모집/미팅 분리, "계약체결중" 라벨.
- **개발사 Q&A AI 요약** (`technicalNotes` 포함) — 상세보기 요약 블록.
- **L2 유사사례** — 상세보기 "유사 프로젝트" 패널 + 집계 통계(계약률·취소단계·`dev_scope`별 계약금액 중앙값, `SimilarStatsPanel`).
- **공고문 검색 (L2 메인 표면)** — `normalize.ts` → 즉석 임베딩 → `POST /api/similar` → `POST /api/review-tips`(버튼으로만 생성). word/pdf/excel/ppt 첨부 지원(`officeparser`), 이미지·스캔 PDF는 **OpenAI 비전 OCR**(`extract-file-text.ts`, tesseract.js가 Vercel 서버리스와 충돌해 교체).
- **동적 페이지 타이틀** — `generateMetadata` + `React.cache`.
- **리포트 개편** (2026-08-09, `4a54ce0`) — 기간 선택(`features/report/period.ts`) 추가.
- **리포트 5개 섹션 추가** (2026-08-11) — 아래 "리포트 확장" 참조.
- **홈 "지금 동기화" 버튼**(브라우저 직접 트리거) — n8n이 Cloudflare Access 뒤라 서버(Vercel)에서 치면 403. 그래서 **Access에 신뢰된 사용자 브라우저**가 `mode:"no-cors"`로 직접 POST한다. 서버 GET `/api/admin/sync`가 `lastRunAt` + `webhookUrl`만 내려준다.
  - **완료 판정 주의:** 동기화 워크플로는 신규분이 있을 때만 `last_run_at`을 올린다 → 트리거 후 ≤24초만 시각 전진을 지켜보고, 안 오르면 "동기화 요청됨" 안내. **거짓 실패·무한 스피너 없음.**
  - ⚠️ `MAX(last_run_at)`이라 **소스 구분이 없다** — 프로젝트 워크플로만 돌아도 시각이 전진해 "됐다"로 보인다. 특정 소스가 실제로 들어왔는지는 화면에서 확인해야 한다.
  - **한계:** no-cors라 성공/차단을 판별 못 하고, 사외망(Access 미신뢰)에선 조용히 무시된다 — 회사 네트워크 필요.

### 사전 미팅 녹취 AI 추출 (2026-08-10, `b2829dd`)

`meetings.summary`(통화 API가 주는 서술형 한 문단, 평균 226자)는 "무슨 프로젝트인가"엔 답해도 **"무엇이 정해졌고 무엇이 남았나"엔 답하지 못해** 별도 추출을 붙였다.

**5종** — 확정사항 / 기술 쟁점·제약 / 리스크 / 미해결 쟁점 / 후속조치. [`src/lib/meeting-extract.ts`](./src/lib/meeting-extract.ts) + [`scripts/extract-meetings.mjs`](./scripts/extract-meetings.mjs)(백필).

- **60,000자 초과 녹취는 줄 경계로 쪼개 조각별 추출 후 병합**(뒤 조각이 앞을 이긴다). 중앙값 28,400자라 대부분 1청크, 최장 165,441자만 3청크. 자르지 않기 위한 분할이다.
- **코드 가드 2개** — 실측으로 필요성이 확인된 것들. 상세는 NEXT_STEPS "미팅·노트 추출에서 배운 것".
- 프로젝트 상세의 미팅 카드 안, 기존 API 요약 아래에 렌더.

### 매니저 노트 파이프라인 + 추출 (2026-08-10, `61af30a`)

**적재** — [`n8n/managenote_incremental.sql`](./n8n/managenote_incremental.sql). 노드명 `manager_cursor`(다른 워크플로의 `cursor`와 이름이 겹쳐서). 화이트리스트(`note_type='memo'` + `flag IN ('normal','notice')`)**만으로는 부족**하다 — 시스템 자동 생성 문구도 같은 값으로 써넣기 때문. `NOT LIKE` 4줄로 63%를 조회 단계에서 잘라낸다(실측: 첫 200건 중 125건).

**추출** — [`src/lib/managenote-extract.ts`](./src/lib/managenote-extract.ts) + [`scripts/extract-managenotes.mjs`](./scripts/extract-managenotes.mjs). **추출 단위가 프로젝트다**(노트 1건은 평균 131자 단편이라 혼자선 뜻이 안 통한다). 6종 — 결과·그 이유 / 공고에 없던 클라이언트 조건 / 과업·금액 변경 / 파트너 평가 / 리스크 / 그 밖에 알아둘 것.

- **노이즈 72%를 LLM이 버린다**(`noiseDropped`) — 미팅 일정 조율, 고객에게 보낼 카톡 원문, 발송 기록. 정규식으로 못 자르는 자유 텍스트라 AI 판정이 필요하고, 그래서 **적재 → AI 판정 → 표시 제외** 순서가 강제된다.
- **원문은 타임라인에 안 넣는다** — 생애주기 축의 사건이 아니라 "그 사이에 매니저가 뭘 했나"라, 24줄이 끼면 마일스톤이 파묻힌다(qna와 같은 처리). 요약 패널 아래 **접힌 카드 목록**으로 분리.
- 원문 렌더는 HTML 이스케이프 해제 + 빈 줄 압축 + URL 링크 + 400자 초과 시 접기.

### 리포트 확장 — 5개 섹션 (2026-08-11)

| 섹션 | 재료 | 짚어야 할 것 |
|---|---|---|
| **검수 매니저별 지표** | `projects.inspection_manager` | **이상민 계정에서만 보인다.** 숨기는 게 아니라 **조회 자체를 안 한다**([`allowed-emails.ts`](./src/lib/auth/allowed-emails.ts) `REPORT_MANAGER_EMAILS`) — 받아놓고 CSS로 가리면 RSC 페이로드에 그대로 실린다 |
| **지원 1~5건 (1건 단위)** | `proposal_count` | 기존 «1~4건» 버킷이 감추던 게 드러난다 — **지원 1건은 계약률 59%**, 2건은 17.7%. 공고 전에 개발사가 사실상 정해져 있던 건이 섞여 있다는 신호 |
| **월별 계약률** | `recruit_started_at`(KST) | 최근 24개월. 최근 달일수록 모집 중이 많아 분모가 작다 → 표본 적음 표시 |
| **유형별 계약률** | `clusters` × `projects.cluster_id` | 22.6%(의료 헬스케어) ↔ 41.3%(웹 유지보수). category(대분류)가 뭉개던 차이 |
| **리스크 Top 10** | `ai_insights.risk_tags` | 비용 초과 27.4% / 일정 압박 26.9% / 요구사항 불명확 20.8% (분모 = 리스크가 잡힌 1,575건) |

**리스크 태깅** — [`src/lib/risk-tags.ts`](./src/lib/risk-tags.ts) + [`scripts/tag-risks.mjs`](./scripts/tag-risks.mjs)(백필). `qna_summary.riskSignals`는 **자유 문장 2,315개가 전부 서로 다르다** — 같은 문장 세기로는 랭킹이 안 나온다. 키워드 규칙도 실측했지만(매칭률 77%) `"…해서 일정에 영향"` 같은 **결과절을 원인으로 오분류**해 일정·비용이 과대 계상됐다. 그래서 고정 15종 택소노미로 LLM이 분류한다.
- **프롬프트가 결과절을 명시적으로 금지한다.** 첫 시도에서 "샘플 데이터 형태에 따라 …일정에 영향" 문장에 `일정 압박`이 같이 붙는 걸 실측하고, 기대 출력을 JSON으로 박아 고쳤다. 이 가드를 빼면 랭킹 1·2위가 통째로 흔들린다.
- 택소노미 밖 값은 버린다 — 태그가 매번 새로 생기면 "가장 자주 반복되는 리스크"라는 질문 자체가 성립하지 않는다.

**유형 클러스터** — [`migrations/018_clusters.sql`](./migrations/018_clusters.sql)(**Neon 적용 완료**) + [`scripts/cluster-projects.mjs`](./scripts/cluster-projects.mjs). 임베딩 6,193건 spherical k-means(k=16), 라벨은 중심 최근접 공고 14건을 보고 LLM이 명명.
- **`centroid`를 테이블에 남기는 이유**는 신규 프로젝트를 **재클러스터링 없이** 최근접 중심에 붙이기 위해서다(cron ⑥). 그래서 백필 마지막에 **최종 중심으로 한 번 더 배정**한다 — 루프가 `배정 → 중심갱신` 순서라 그냥 끝내면 저장된 `cluster_id`가 한 세대 전 중심의 결과가 되고, cron과 규칙이 어긋난다.
- ⚠️ **재실행하면 유형 경계와 이름이 바뀐다.** 기간별 비교 중이면 함부로 돌리지 않는다.
- `비공개 프로젝트`(114건, 계약률 55.8%)는 모델 오류가 아니라 실제 군집이다 — 공고문이 통째로 가려진 건들. 유형이라기보단 데이터 가용성 버킷이라 해석에 주의.

### 개인별 즐겨찾기(관심) — 서버 저장 (2026-08-11)

목록·칸반의 ★ 버튼과 "★ 관심" 필터는 있었지만 상태가 `AppContext`의 `useState({p1:true})` 한 칸이라 **새로고침하면 사라지고 로그인 계정과도 무관**했다. [`migrations/017_favorite.sql`](./migrations/017_favorite.sql)(`(manager_email, project_id)` 복합 PK, **Neon에 적용 완료**) + [`src/lib/favorites.ts`](./src/lib/favorites.ts) + `POST /api/favorites`.

- 관심 목록은 `(app)/layout.tsx`가 세션 이메일로 한 번 읽어 `initialStarred`로 주입한다(그래서 GET 라우트가 없다). **마이그레이션 미적용·mock 환경에서 화면이 죽지 않게 실패 시 빈 목록.**
- 별표는 낙관적 갱신 후 저장, 실패하면 되돌린다. `project_id`가 BIGINT라 숫자가 아닌 id(mock `"p1"`)는 400.
- **알려진 한계:** "★ 관심" 필터는 별표 id 전체를 쿼리스트링으로 보낸다(기존 방식 유지). 수백 건 쌓이면 URL이 길어져 서버 JOIN으로 바꿔야 한다.

### `review_session` 저장 — Phase 3 완료 (2026-08-07, `7f01635`)

`/test`의 전 과정이 stateless라 프로젝트 두 건을 번갈아 보면 덮어써지던 문제를 해소. [`migrations/013_review_session.sql`](./migrations/013_review_session.sql) + [`src/lib/review-session.ts`](./src/lib/review-session.ts) + `/api/review-session`.

- **`project_id`에 FK를 걸지 않는다** — 검수 대상은 `status='submitted'`라 CaseLab `projects`(모집 이후만 동기화)에 없다. 공고 등록 후 사후 매칭용 자리.
- **녹취 원문은 저장 안 한다**(사용자 결정) — `call_id`와 요약만. 원문이 필요하면 통화 API로 재조회. 원천에 있는 걸 복제하지 않으니 "녹취 속 사람 이름" PII 문제가 안 생긴다.
- 한 세션 = 한 행, 덮어쓰기. "새 검수"를 눌러야 새 행.
- 알려진 한계였던 **"완료 리뷰가 DB에 저장 안 됨"**(쓰기 라우트 부재)도 여기서 해소.

### 검수 스코어링/견적/질문 프로토타입 — `/test`

러프한 고객 의뢰 인풋 하나 → 병렬 산출. 격리 라우트라 기존 기능 무영향.

- **브리핑**(`brief.ts`) — 한 줄 정의 / 핵심 3~5 / 기술적으로 알아야 할 것 / 고객이 원하는 것(추론이면 `추측` 배지).
- **질문**(`questions.ts`) — 업무범위 구체화·견적용 확인 질문만. 스코어링과 완전 분리. **실사용 합격.**
- **스코어링**(`scoring.ts`) — SCORING_SPEC 12섹션 confidence + 섹션별 `applicable` 판정(해당없음은 총점·게이트에서 제외, 나머지 가중치로 재정규화).
- **견적**(`estimate.ts` + `estimate-calc.ts`) — **판단(LLM)과 계산(코드) 분리.** 금액 산수는 `prompt.md` 단가표대로 코드가 결정적으로 계산.
- **공고문 재배치**(`repost.ts`) — 원문 워딩 불변, 위치만 SCORING_SPEC §1 양식으로.
- **검수통화 녹취 조회·다중선택** — 브라우저 → n8n 프록시 웹훅 → 통화 API. **CaseLab 서버·DB 미관여.** 이름/번호 **택일 토글**(API가 둘을 AND로 걸어 0건이 되는 걸 실측). PII 3중 검증 완료. [`n8n/calls_proxy_pipeline.md`](./n8n/calls_proxy_pipeline.md), env `N8N_CALLS_WEBHOOK_URL`.
- **공고문 draft**(`draft.ts`) — 의뢰 원문 + 고른 녹취 → 공고 초안. 워딩 다듬기 허용, 없는 사실 생성 금지. **통화가 원문을 이긴다.**
- 결과는 localStorage(`caselab-test-last`)에 저장. **Mock 모드(기본 ON)** — API 안 치고 고정 번들 표시.

---

## 🔜 다음 착수 — 미정 (아래에서 고른다)

**Phase 4 — 프로젝트 상세에 검수 이력 표시.** Phase 3이 끝나 이제 가능하다. 공고 등록 후 `project_id`로 `review_session`을 사후 매칭해 "이 프로젝트는 검수 때 이랬다"를 상세에서 보여준다.

**L3 — 청크 임베딩(RAG).** 재료가 크게 좋아졌다. 전에는 qna 요약뿐이었는데 지금은 **미팅 추출 133건 + 노트 추출 646건**이 붙었다. "이 PG 썼을 때 뭐가 문제였나", "이런 파트너는 왜 탈락하나" 같은, 답이 본문 안에 있는 질문을 다룬다. 상세는 NEXT_STEPS "임베딩 인덱스는 두 개".

**하드닝 — 배치 트렁케이션 감지(`expected` 필드).** qna 346건 유실을 냈던 그 경로가 managenote에도 그대로 있다. n8n·CaseLab 양쪽 변경. 상세는 NEXT_STEPS.

**미검증으로 남은 것 (실사용 확인 필요):**
- **공고문 draft** — 코드만 완료, 실제 통화로 안 돌려봄.
- **브리핑 "기술적으로 알아야 할 것"** — 역방향 가드 도입 후 재실행 미확인. 안 되면 이 항목만 `gpt-4o` 상향이 다음 레버(비용은 사용자 결정).
- **`GATE_THRESHOLD=60`·필수 4개**(purpose·features·admin·platform) — 여전히 미검증값.
- **통화 종료 후 API 반영 지연** — 미측정.

---

## ⚠️ 블로커 / 대기 / 잊지 말 것

- **n8n 스케줄 확정** — 워크플로가 소스별로 구성돼 있으나 **스케줄 주기가 미확정**이다. 안 걸려 있으면 동기화 버튼을 눌러야만 데이터가 들어오고, cron은 할 일이 없다. 사전 미팅 녹취(`meeting_transcripts`)는 매 실행이 최근 60일을 전량 재스캔·멱등 upsert라 크론을 걸어도 무해하다. **managenote를 동기화 웹훅에 연결했는지도 확인 필요.**
- **AI 프롬프트(ⓒAI 필드)** — **전부 완료.** 마지막 남았던 리스크 태그가 2026-08-11에 붙었다(위 "리포트 확장").
- **`manager_sumin` 실명 미상** — 매니저별 지표 표에 계정명 그대로 나온다(6건). 실명을 알면 [`src/lib/managers.ts`](./src/lib/managers.ts) `MANAGER_NAMES`에 한 줄 추가. 추측해서 붙이지 않는다.
- **계약금액 0원 건 정체** — 운영팀 확인 중. 집계 시 0 제외 예정. **착수 안 함(사용자 지시).**
- **임베딩 DB 외부 참조 — owner URL 노출 처리 대기** (2026-07-27) — 읽기전용 롤 `embedding_ro` 발급 + 핸드오프 문서([EMBEDDING_DB_HANDOFF.md](./EMBEDDING_DB_HANDOFF.md)) 작성 완료. **대기결정:** 사용자가 이미 저쪽에 `neondb_owner`(쓰기 가능) URL을 준 상태 → RO URL로 교체 안내함. owner URL이 통제 밖에 남았으면 `neondb_owner` 비번 로테이션 필요(하면 `.env.local`·Vercel `DATABASE_URL`도 같이 갱신). **로테이션 여부 미결.**
- **정규화 미세 이슈(무해)** — 안 고른 선택옵션이 가끔 불릿으로 새어듦. 실신호가 지배해 매칭엔 영향 없음.

## 🔧 운영 스크립트

```bash
node scripts/extract-qna.mjs [N]          # qna 요약 (qna_summary IS NULL만)
node scripts/embed-projects.mjs [N]       # 공고문 임베딩 (embedding IS NULL만, 429 재시도)
node scripts/extract-meetings.mjs [N]     # 미팅 녹취 추출 (ai_extract IS NULL 또는 녹취 길이 변화)
node scripts/extract-managenotes.mjs [N]  # 매니저 노트 추출 (note_extract IS NULL 또는 노트 수 변화)
node scripts/tag-risks.mjs [N]            # 리스크 태깅 (risk_tags IS NULL & riskSignals 있음)
node scripts/cluster-projects.mjs [k=16]  # ⚠️ 전량 재클러스터링 — 유형 경계·이름이 바뀐다
```

전부 멱등 — 이미 처리된 건 자동 스킵, 재실행하면 신규분만. 원본(`timeline_events`·`meetings`)은 불변, 파생만 갱신.

**마이그레이션은 러너가 없다** — `migrations/0NN_*.sql`을 Neon 콘솔에서 수동 적용한다. 전부 `IF NOT EXISTS`/멱등이라 여러 번 실행해도 안전.

## 작업 규칙

git은 AI가 직접 실행 안 함, 복붙 명령어만(CLAUDE.md §6). 변경 리포트+체크리스트+컨펌 후 커밋. 원격 origin = github.com/chyon8/caselab. dev 서버는 사용자가 3000포트로 띄움.
