# CaseLab 백필 런북 (2026-07-14)

> 순서대로 그대로 따라 하면 된다. 순서를 바꾸면 커서가 멈춘다.
> 설계 근거는 [DATA_INTEGRATION.md](./DATA_INTEGRATION.md), 원본 스키마는 [DATA_SCHEMA.md](./DATA_SCHEMA.md).

---

## 가져올 것 (2026-07-14 확정)

| 대상 | 건수 | 워크플로 SQL | 수신 |
|---|---|---|---|
| projects | **5,993** | [`n8n/projects_incremental.sql`](./n8n/projects_incremental.sql) | `/api/sync/projects` |
| Q&A (개발사 댓글) | **21,324** | [`n8n/qna_incremental.sql`](./n8n/qna_incremental.sql) | `/api/sync/timeline` |

> **매니저 코멘트(~129,000건)는 보류 (2026-07-14 결정).** SQL은 [`n8n/managenote_incremental.sql`](./n8n/managenote_incremental.sql)에
> 완성해뒀지만 워크플로는 만들지 않는다. projects의 20배 분량인데, 매니저 메모는 **요약·추출을 거쳐야
> 정보가 된다** — 그게 대기 결정 #2(AI 프롬프트 검토)에 묶여 있어 지금 긁어와도 쌓여만 있다.
> 미루는 비용은 없다: 독립 워크플로라 projects 재백필이 필요 없고, 커서가 `date_created` 기준이라
> 나중에 돌려도 전량 그대로 들어온다.

**범위:** 2024-11-11 이후 모집 전환된 **외주(task_based)** 프로젝트.
검수중(`submitted`)은 모집 전환에 실패한 건이라 제외. 기간제 제외. **취소·반려 건은 포함**한다 —
"왜 깨졌나"가 CaseLab이 배워야 할 데이터다.

---

## STEP 1. Neon — 마이그레이션 + 초기화

Neon 콘솔 SQL 에디터에서 실행.

```sql
-- 1-1. 새 컬럼 (migrations/004_scope_funnel.sql)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS dev_scope       TEXT,
  ADD COLUMN IF NOT EXISTS is_turnkey      BOOLEAN,
  ADD COLUMN IF NOT EXISTS planning_status TEXT,
  ADD COLUMN IF NOT EXISTS proposal_count  INT;

-- 1-2. 기존 데이터 전부 삭제 (100건 테스트분)
TRUNCATE projects CASCADE;   -- timeline_events·calls·reviews 도 같이 지워진다
DELETE FROM sync_state;      -- 커서 초기화 — 이걸 안 하면 어제 커서(2026-07-13)에서 이어간다
```

**확인:** `SELECT count(*) FROM projects;` → **0**

---

## STEP 2. n8n — 워크플로 3개 준비

### 2-1. 노드 구성 (projects 기준, 나머지 둘도 동일)

```
① Cron  →  ② GET 커서  →  ③ POST 본진 조회  →  ④ POST CaseLab 적재  →  ⑤ IF 루프
                  ↑                                                          │
                  └──────────────────  더 있으면 되돌아감  ──────────────────┘
```

| 노드 | 하는 일 |
|---|---|
| ② GET 커서 | `GET {CASELAB}/api/sync/cursor?source=projects` → `{ts, id}` |
| ③ POST 본진 | `POST http://wishket-api-server:8001/query` — body에 SQL, `{{TS}}`/`{{ID}}` 치환 |
| ④ POST 적재 | `POST {CASELAB}/api/sync/projects` — body `{ rows: [...] }` |
| ⑤ IF 루프 | ④ 응답이 `upserted > 0 && skipped == 0` 이면 **②로 되돌린다** |

> **⑤가 이번에 새로 추가된 노드다.** 없으면 200건 한 배치만 넣고 끝난다.
> 매니저 코멘트는 645배치라 손으로 누를 수 없다.

### 2-2. 커서 fallback 값

② 노드의 기본값(커서가 없을 때)을 **`2000-01-01T00:00:00Z`** 로 둔다. 세 워크플로 모두.

> ⚠️ 커서는 `date_modified` 기준인데 범위는 `date_start_recruitment` 기준이다. 서로 다른 컬럼이라
> 커서 시작값을 2024-11-11로 맞추면 "모집 전환은 그 뒤인데 date_modified가 앞선" 행이 조용히 유실된다.
> 범위는 SQL의 WHERE가 잡으니 커서는 충분히 과거로 두면 된다.

### 2-3. 세 워크플로의 차이

**딱 두 곳만 다르다.**

| | ③ 조회 SQL | ④ POST 대상 | ② 커서 source |
|---|---|---|---|
| projects | `projects_incremental.sql` | `/api/sync/projects` | `projects` |
| Q&A | `qna_incremental.sql` | `/api/sync/timeline` | `qna` |

---

## STEP 3. 백필 실행 — 반드시 이 순서

### 3-1. projects (5,993건 / 30배치)

워크플로 수동 실행 → 루프가 알아서 끝까지 돈다.

**확인:**
```sql
SELECT count(*) FROM projects;                          -- 5993
SELECT dev_scope, count(*) FROM projects GROUP BY 1;    -- "개발,디자인" 형태로 나오는가
SELECT count(*) FROM projects WHERE proposal_count > 0; -- 0이 아닌가
```

숫자가 5993이 아니면 **중간에 배치가 멈춘 것**이다. `sync_state.cursor_value`를 보고 어디서 섰는지 확인한다.

### 3-2. Q&A (21,324건 / 107배치)

> **projects가 5993으로 완주한 뒤에 돌린다.** 프로젝트가 CaseLab에 없으면 그 댓글은 skip되고,
> 수신 라우트는 **skip이 하나라도 있으면 커서를 세우지 않는다** → 같은 배치를 무한 재시도한다.

**확인:** `SELECT count(*) FROM timeline_events WHERE source='qna';` → 21324

---

## 백필 후

### 즉시 확인

- 화면에서 매니저 이름이 `manager_semin` 같은 **계정명 그대로** 보이는가?
  → 보이면 [src/lib/managers.ts](./src/lib/managers.ts)에 실명 매핑 추가
- 상세 화면 타임라인에 개발사 Q&A가 뜨는가?

> **비공개 Q&A는 그대로 보여준다 (2026-07-14 확정).** 개발사 댓글 21,324건 중 18,780건(88%)이
> 비공개(`status=0`)지만, 매니저는 원래 어드민에서 다 보던 것이다. 숨길 이유가 없다.
> 화면에는 "비공개" 배지만 달아 **클라이언트에게만 갔던 질문**이라는 맥락을 표시한다.

---

## 알려진 한계

**🟡 모집 퍼널의 "조회수"는 원천이 없다.** 본진 `project_project` 전체 필드에 view_count 류 컬럼이
없다. 퍼널은 **지원 → 미팅 → 선정** 3단으로만 그릴 수 있다.

> `proposal_count`는 문제없다. 2026-07-14 본진 실측 결과 지원이 들어오면 `date_modified`도
> 갱신된다(98.9%). 나머지 1.1%는 방금 지원이 들어온 모집중 건이고 다음 수정 때 따라잡힌다.
> `proposal_proposal` 별도 동기화는 필요 없다.

**🟡 매니저 코멘트·Q&A는 수정을 반영하지 않는다.** 두 원천 테이블 모두 `date_modified`가 없어
커서를 `date_created`로 잡았다. 한 번 가져온 글이 나중에 수정돼도 다시 받지 않는다.

**🟢 완료 리뷰가 DB에 저장되지 않는다 — 고치지 않기로 결정 (2026-07-13).**
저장 버튼을 눌러도 React 상태만 바뀐다. 테이블(`reviews`)과 어댑터 메서드는 있고 **쓰기 API 라우트만 없다.**

**🟡 알림(notifications)은 항상 빈 배열.** 본진에 대응하는 원천 테이블이 없다.

**🟡 모바일 반응형 미구현.** 코드 전체에 미디어쿼리가 하나도 없다.

---

## 오늘 완료 (2026-07-14)

- 백필 범위 확정 (2024-11-11 이후 모집 전환된 외주 5,997건)
- 개발 범위·턴키·기획자료·지원자 수 → 상세 화면 칩으로 표시
- 검수 시작일 기준 기간 필터 (기존엔 본진 최종수정일 기준이라 엉뚱했다)
- 라이프사이클 날짜 6종 저장 → **상세 화면에 단계별 소요일 표시**
- 목록 페이로드 5.9MB → 3.2MB (gzip 400KB), 페이지 번호 네비게이션, 칸반 렌더 제한
- Q&A: 비공개 댓글 포함, 답변·비공개 배지 표시, NUL 바이트 크래시 수정

---

## 다음

### ⓪ 🔴 Q&A 댓글 유실 — 이것부터 (2026-07-14 저녁 발견)

**증상:** 백필 후 여러 프로젝트의 Q&A가 통째로 비어 있다 (예: project 156821, 그 외 다수).
프로젝트 자체는 목록에 정상적으로 뜬다.

**실측:**

| | 값 |
|---|---|
| `SELECT cursor_value FROM sync_state WHERE source='qna'` | `2026-07-14T07:50:18Z\|97447` — 사실상 "현재"까지 완주 |
| `SELECT count(*) FROM timeline_events WHERE source='qna'` | **16,717** (예상 21,324 — 4,607건 부족) |

**이 두 값은 코드상 서로 모순이다.** [`timeline/route.ts`](./src/app/api/sync/timeline/route.ts)는
`skipped > 0`이면 커서를 세우지 않는다. 커서가 끝까지 갔다는 건 모든 배치의 skipped가 0이었다는 뜻이고,
그러면 pull된 행은 전부 insert됐어야 한다. [`cursor.ts`](./src/lib/sync/cursor.ts)도 정상이다
(id를 숫자로 비교, ts 재포맷 없음). 즉 **커서가 앞질러 간 게 아니라, SQL이 애초에 4,607건을 안 가져왔다**는
쪽이 유일하게 성립하는 설명이다.

**1순위 용의자 — n8n ② 커서 노드의 fallback 날짜.**
위 STEP 2-2는 fallback을 `2000-01-01T00:00:00Z`로 두라고 했는데, [`n8n/README.md`](./n8n/README.md)에는
projects용 예시로 `2025-07-13T00:00:00Z`가 적혀 있다. **qna 워크플로가 이 값을 물려받았다면 그 이전 댓글이
통째로 유실된다** — 커서는 정상 완주하고, skip도 0이고, 조용히 안 가져온다. 한 프로젝트의 댓글은 모집 시점에
몰려 있으므로 "프로젝트 단위로 통째로 빈다"는 증상과도 일치한다.

**판별 순서 (1번이 결정적):**

1. **Neon에서 월별 분포부터 본다.**
   ```sql
   SELECT date_trunc('month', event_at) AS m, count(*)
   FROM timeline_events WHERE source='qna' GROUP BY 1 ORDER BY 1;
   ```
   가장 이른 달이 2024-11이 아니라 2025-07쯤에서 뚝 시작하면 → **fallback 날짜 확정.**
   고치는 건 n8n 노드 값 하나 + 커서 리셋 후 재실행. 독립 워크플로라 projects 재백필은 필요 없다.
2. 분포가 2024-11부터 고르면 fallback은 무죄. 본진에서
   [`qna_incremental.sql`](./n8n/qna_incremental.sql)의 JOIN 조건 그대로 `count(*)`를 세본다.
   16,717이면 유실 없음(빈 프로젝트는 진짜 댓글 0건), 21,324면 pull 후 유실 → 라우트/노드를 다시 판다.
3. 빈 프로젝트 3~4개를 본진에서 직접 조회해 댓글 유무·`date_created` 확인.

> ⚠️ 어드민 카드에서 보던 "댓글"이 **매니저 코멘트**(`management_managenote`)라면 안 뜨는 게 정상이다
> (아직 동기화 안 함). 이 버그와 무관.

### ① meeting_meeting 동기화 → 타임라인 채우기

**상세 페이지 타임라인이 지금 완전히 비어 있다.** `timeline_events`가 0건이다.

`status`/`change` 이벤트는 **기존 행이 바뀔 때만** 생성되는데, 백필은 전부 신규 insert였고
5,997건 중 대부분이 이미 완료·취소된 프로젝트라 앞으로도 안 바뀐다 → **영원히 빈칸.**

라이프사이클 날짜로 타임라인을 합성하는 건 **답이 아니다** — 그건 상단 스테퍼와 같은 정보다.
진짜 사건이 필요하고, 그건 `meeting_meeting`(미팅)과 `management_managenote`(매니저 노트)에 있다.

> ⚠️ `meeting_meeting`에는 `client_cell_phone_number`·`partner_cell_phone_number`가 있다. **SELECT 하지 않는다.**

### ② 임베딩 — **사용자가 집에서 진행 예정 (2026-07-14)**

**핵심: 인덱스가 두 개다.** 하나로 뭉치면 둘 다 안 된다.

| | **A — 프로젝트 (유사사례)** | **B — 청크 (AI 어시스턴트/RAG)** |
|---|---|---|
| 단위 | 프로젝트 1건 = 벡터 1개 | 텍스트 조각 = 벡터 1개 |
| 텍스트 | 제목 + 공고문 + 카테고리 + 기술 | Q&A 댓글 · 매니저 노트 · 녹취 요약 |
| 저장 | `projects.embedding` — **이미 있음** | **새 테이블 필요** (`timeline_events`에 벡터 컬럼 없음) |
| 개수 | 5,997 (36MB) | 수만~15만 (1536차원이면 774MB — Neon 무료 0.5GB 초과) |
| 상태 | **바로 가능** | 어시스턴트 만들 때 |

**왜 나눠야 하나:** "이 PG 썼을 때 뭐가 문제였나"의 답은 프로젝트 레코드가 아니라 **댓글 본문 안에** 있다.
프로젝트 단위 벡터로는 절대 못 찾는다. 반대로 "비슷한 프로젝트"는 청크로 찾을 수 없다.

**A는 지금 바로 가능하다.** 목록의 "AI 유사사례 제안"이 **가짜**(같은 카테고리 문자열 매칭)인데,
라우트 하나(`embedding IS NULL` 소배치) + `ORDER BY embedding <=> :vec LIMIT 5`면 진짜가 된다.
`content_hash`가 바뀐 것만 재임베딩하는 로직은 이미 들어가 있다.

> **사내망 불필요.** Neon(인터넷) → 임베딩 API(인터넷) → Neon. 본진 MySQL을 안 거친다.
> n8n도 필요 없다. 집에서 된다.

### ③ 유사사례 집계 뷰 ← 제품의 핵심

유사사례를 나열만 하지 말고 **그 묶음의 통계**를 보여준다.
"이 유형은 계약률 40%, 취소는 주로 모집 단계에서, 모집 평균 3주."

**AI가 필요 없다. SQL만으로 된다.** 오늘 넣은 라이프사이클 날짜가 그 재료다.

### ④ 특약(subcontracts) 미러링 — 계약 "내용"은 현재 한 글자도 없다

지금 화면의 계약 정보는 `contractAmount` 칩(= `agreement_price` 총액) 하나뿐이다.
`work_scope`/`work_detail`은 **가져오지도, 저장하지도, 렌더링하지도 않는다** — 코드 전체에서
`sub_contract_subcontract`가 나오는 곳은 `projects_incremental.sql`의 `has_valid_agreement`
EXISTS 서브쿼리 하나뿐이고, 거긴 "존재하냐"만 볼 뿐 컬럼을 SELECT하지 않는다.

**가져올 것 (전부 순수 텍스트 컬럼 — 파서도 OCR도 필요 없다):**

| 컬럼 | 내용 |
|---|---|
| `sub_contract_subcontract.work_scope` | 업무 범위 |
| `sub_contract_subcontract.work_detail` | 업무 상세 |
| `sub_contract_subcontract.total_price` / `date_contracted` | 특약별 금액·체결일 |
| `milestone_milestone.title` / `price` / `tally_condition` | 차수별 과업·금액·검수조건 |

계약 후 과업 팽창률. `agreement_price`는 총액이라 "5,300만 원계약 + 채팅 특약 500만"인지
"5,800만 한 방"인지 구분이 안 된다. **이걸 아는 유일한 원천이 특약 행이다.**

> **계약 첨부파일은 파싱하지 않는다 (2026-07-14 확정).** 위 컬럼이 계약 내용의 90%다.
> `project_projectfile`은 S3 FileField라 signed URL 생성이 앱 레벨에 있어 n8n에서 못 뽑고,
> PDF/HWP 파서까지 붙이면 5,993건 × 여러 파일로 비용이 급증한다. 상세 화면엔 어드민 링크만 건다.

**같이 고칠 것 — `agreement_price` 서브쿼리 조건 불일치 (버그).**
[`projects_incremental.sql`](./n8n/projects_incremental.sql)에서 금액은 `hide=0, date_deleted IS NULL`만
걸고 `ORDER BY a.id DESC LIMIT 1`로 뽑는데, 바로 위 `has_valid_agreement`는 유효 특약
(`is_incomplete_addon=0 AND is_cancel_addon=0`)까지 확인한다. **조건이 달라서, 한 프로젝트에 agreement가
여러 개면 0원짜리 껍데기를 고를 수 있다.**
→ 금액을 `agreement_price` 대신 **유효 특약의 `SUM(sc.total_price)`로 유도**하면 특약 증액이 자동 반영되어
과업 팽창률이 덤으로 나온다.
→ 집계 시 0/NULL은 분모에서 제외하고, **평균이 아니라 중앙값 + 사분위수**를 쓴다 (계약금액은 롱테일이라
평균이 큰 건 몇 개에 끌려간다).

### ⑤ 선정 파트너 (싸다 — 새 워크플로 불필요)

`agreement_agreement.partner_id` → `partners_partners`에서 `grade`(prime/pro/boost), `rating`,
`team_size`, `project_accepted`(누적 수주), `job_slug`. 이미 agreement를 스칼라 서브쿼리로 뽑고 있으니
`projects_incremental.sql`에 몇 줄 추가하면 끝이다.

**왜:** 지금 CaseLab은 "왜 깨졌나"를 프로젝트 속성으로만 본다. 원인의 절반은 파트너 쪽에 있다 —
"팀 규모 1명 파트너가 붙은 고액 건의 완료율", "신규 파트너 vs prime 등급의 취소율"은 **AI 없이 SQL만으로**
나온다.

> **결과물(산출물)은 안 가져온다 (2026-07-14 확정).** 본진에 산출물 테이블 자체가 없다.
> `project_projectfile`은 클라이언트가 올린 기획서/RFP지 파트너 납품물이 아니다. 원천이 없고 효용도 낮다.

---

### ⑥ 매니저 코멘트 — 비용은 병목이 아니다 (계산 완료 2026-07-14)

"AI를 너무 많이 쓰는 것 아닌가"의 답: **계산해보면 안 많이 쓴다.**

노트 129,000건 / 프로젝트 5,993개 = **프로젝트당 21건.** 핵심은 **노트당 1콜이 아니라 프로젝트당 1콜**이라는
것 — 한 프로젝트의 노트 21개를 묶어 넣으면 콜은 129,000번이 아니라 5,993번이다.
노트 평균 200토큰 가정 시 입력 ~29M / 출력 ~3.6M 토큰.

| 모델 | 단가 (per MTok) | Batch API 50% 적용 |
|---|---|---|
| Haiku 4.5 | $1 / $5 | **~$25** (1회성 전량) |
| Sonnet 5 | $3 / $15 (인트로 $2/$10, ~2026-08-31) | ~$50 |

증분은 하루 수백 건이라 반올림하면 0. **진짜 병목은 품질과 스키마다.**

**설계 원칙 — 요약이 아니라 추출로.** `{이슈유형, 발생단계, 원인태그, 심각도, 근거문장}` 고정 스키마로
뽑아야 SQL 집계가 되고 "이 유형은 취소율 40%, 원인 1위는 예산 미확정" 같은 게 나온다. 자유 텍스트 요약은
검색도 집계도 안 되는, 한 번 읽고 버리는 정보다.

**그 전에 AI 0원 필터 (첫 액션은 SQL 한 줄):**
```sql
SELECT note_type, flag, count(*) FROM management_managenote GROUP BY 1,2 ORDER BY 3 DESC;
```
정산·행정(`flag` = `bill`/`deposit`/`remittance`)과 자동생성 추정(`note_type` = `history`/`checklist`)을
빼면 129,000이 얼마로 줄어드는지부터 본다. 그다음 본문 앞 30자 `GROUP BY`로 빈발 정형문("확인했습니다" 등)
상위 100개를 룰로 제거.

**우선순위: ③(유사사례 집계 뷰)이 먼저다.** ③은 AI가 한 톨도 안 들어가고 SQL만으로 제품 핵심 가치를 낸다.
매니저 노트는 그다음.

> **관통 원칙:** 날짜·금액·상태·퍼널·계약률은 SQL이 더 정확하고 공짜 — AI를 쓰지 않는다.
> AI는 SQL이 손도 못 대는 자연어(노트·Q&A·통화요약·공고문)에만, 그것도 고정 스키마 추출로.

---

## 대기 중인 결정

| # | 내용 | 막고 있는 것 |
|---|---|---|
| 1 | 통화 요약의 외부 클라우드 저장 승인 (§7-5) | 녹취 파이프라인 전체 |
| 2 | AI 프롬프트 검토 | 이슈 추출·리스크 태그·공고문 구조화·요약 |
| 3 | **임베딩 제공자 선택** | 임베딩 (Anthropic은 임베딩 API가 없다 — 외부 제공자 필요) |
| 4 | **공고문의 제3자 API 전송 승인** | 임베딩 |
| 5 | **계약금액 0원 건의 정체 — 운영팀 확인 중** (예: project 154633) | 계약금액 집계·평균 (0은 분모에서 제외 예정) |

> **3·4는 사용자가 집에서 생각해보고 답하기로 함 (2026-07-14).**
> 4번 부연: 공고 원문 5,997건이 외부 임베딩 API로 나간다. 연락처는 `scrubPii`로 이미 제거됐지만
> 고객사명·프로젝트 내용은 그대로 전송된다. Neon(외부 클라우드) 저장은 이미 넘은 경계지만,
> "제3자 API 전송"은 성격이 다르다.
