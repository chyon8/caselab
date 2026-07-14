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

## 다음 (백필 완료 후)

### 우선 — 사용자가 "중요하다"고 명시 (2026-07-14)

1. **개발 범위 화면 표시** — 데이터(`dev_scope`)는 이번 백필로 들어온다. 화면에 붙이는 건 아직.
2. **매니저 코멘트** — 동기화 자체가 보류 중. SQL은 완성돼 있으니 프롬프트 확정되면
   워크플로 하나 만들어 645배치 돌리면 된다 (10~20분).
3. **AI 검수 어시스턴트** — 링크 주면 공고·첨부파일 긁고 유사사례·리스크·질문·미팅 준비사항 생성.
   첨부파일(`project_projectfile`) 동기화가 선행돼야 한다.
4. **불러온 지식 안에서 대화** (RAG 챗)
5. **프로젝트 횡단 인사이트** — "이 PG/솔루션 썼을 때 뭐가 문제였나"

### 대기 중인 결정

| # | 내용 | 막고 있는 것 |
|---|---|---|
| 1 | 통화 요약의 외부 클라우드 저장 승인 (§7-5) | 녹취 파이프라인 전체 |
| 2 | AI 프롬프트 검토 | 이슈 추출·리스크 태그·공고문 구조화·요약 |

### 데이터가 쌓인 뒤

1. **임베딩 백필** — `embedding IS NULL`인 행을 소배치로. 1년치 ≈ $1 미만.
2. **유사사례 검색** — `ORDER BY embedding <=> :query_vec LIMIT 5` (pgvector)
   > 지금 목록의 "AI 유사사례 제안"은 **가짜다.** 같은 카테고리를 문자열 매칭할 뿐이다.
3. **특약(subcontracts) 미러링** — 계약 후 과업 팽창을 알 수 있는 유일한 원천.
   `agreement_price`는 총액이라 "원계약 + 채팅 특약"인지 "한 방"인지 구분이 안 된다.
4. **유사사례 집계 뷰** — 계약률·취소율·취소 단계 분포·예산 델타는 **AI 없이 지금 데이터로 계산된다.**
   "이 유형은 계약률 40%, 취소는 주로 모집 단계에서" 같은 화면.
