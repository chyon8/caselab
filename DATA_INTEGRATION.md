# CaseLab 데이터 연동 설계서 (최종)

> 본진(위시켓) 데이터를 CaseLab으로 가져오는 전체 설계.
> 원본 스키마 레퍼런스: [DATA_SCHEMA.md](./DATA_SCHEMA.md)
>
> **확정된 결정:**
> - CaseLab 자체 DB = 클라우드 Postgres (pgvector 포함, 별도 벡터 DB 없음)
> - 구조 = **초기 백필+임베딩 1회 → 이후 증분 동기화 상시** (§5)
> - 녹취 = **요약만 저장.** 전화번호·녹취 원문은 CaseLab에 아예 전송되지 않음 (§3)
> - 초기 백필 = 최근 1년 · 본진 DB에는 절대 쓰지 않음(read-only)
>
> **대기 중인 결정:** 동기화 방향(push/pull) — 개발팀 확인 후 확정 (§7). 어느 쪽이든 이 문서의 설계는 동일하고, n8n 마지막 노드 하나만 달라진다.

---

## 1. 아키텍처

```
[본진 MySQL replica]──┐
[통화/녹취 API]────────┤  (사내망 — 외부 접근 불가)
                      │
                   [n8n]   ← 사내망에서 둘 다 접근 가능
                      │   ① 크론: 복합 커서 기준 변경분 조회 (삭제분 포함)
                      │   ② 전화번호 등 PII는 워크플로 내부에서만 사용 후 폐기
                      │   ③ HTTPS + 시크릿 키로 CaseLab에 전달
                      ▼
        [CaseLab /api/sync/*]  (Vercel API Route)
                      ▼ upsert + 변경 감지(diff) → 변경 이벤트 자동 생성
            [CaseLab Postgres]
              ├─ projects          본진 스냅샷 (미러) + 임베딩
              ├─ timeline_events   노트·미팅·계약·Q&A·변경이력 통합 이벤트
              ├─ calls             통화 요약 (PII 없음)
              ├─ reviews           완료 리뷰 (CaseLab 고유)
              ├─ ai_insights       AI 산출물 (CaseLab 고유)
              └─ sync_state        소스별 동기화 커서 (단일 진실)
                      ▲
              [Next.js 화면] ← 어댑터는 이 DB만 조회
```

- **push 확정 시**: n8n 크론이 조회 후 CaseLab `/api/sync/*`로 POST (인바운드 개방 없음, 권장)
- **pull 확정 시**: CaseLab 크론(Vercel Cron)이 n8n 웹훅을 호출해 당겨옴 (n8n 공개 URL 필요)

---

## 2. 상태 매핑 규칙 (본진 → CaseLab 6단계)

판정 순서대로 적용한다. (⚠️ status만 보면 안 됨 — DATA_SCHEMA §2)

| 순서 | 본진 조건 | CaseLab 상태 | stage |
|---|---|---|---|
| 1 | `is_cancelled=1` OR `is_rejected=1` OR `date_cancelled/date_rejected NOT NULL` | 완료(취소) | 5 |
| 2 | `status='completed'` | 완료(성공) | 5 |
| 3 | **유효 계약 존재** AND (`agreement.status=1` OR `date_start_progress NOT NULL`) | 진행 | 4 |
| 4 | `status='contracted'` OR **유효 계약 존재** | 계약 | 3 |
| 5 | `status IN ('recruiting','close_recruiting')` | 모집 | 2 |
| 6 | `status='submitted'` | 검수 | 1 |
| 7 | `status IN ('open','saved','frozen')` | **동기화 제외** (등록 전 단계) | — |

**유효 계약 존재** = `agreement_agreement(hide=0, date_deleted IS NULL)` + `sub_contract(is_incomplete_addon=0, is_cancel_addon=0)` 존재.
→ 본진 status가 뒤처져 있어도(예: `close_recruiting`인데 계약 체결됨) 계약/진행으로 승격한다. DATA_SCHEMA §2 성공 판단식과 동일한 원리.

**취소 발생 단계**(`cancel.stage`): 취소 시점에 마지막으로 도달했던 단계를 역산 — `date_start_recruitment` 없으면 "검수", 있으면 "모집", 유효 계약 존재 시 "계약".

**삭제/숨김**: 본진에서 `date_deleted` 또는 `management_hide=1`이 되면 CaseLab은 행을 지우지 않고 `deleted_at`/`hidden`을 마킹하고 목록에서 숨긴다 (§5 증분 쿼리가 삭제분도 가져옴).

---

## 3. 필드 매핑표 (원본 → CaseLab)

출처 표기: **ⓐ** 본진 DB 직접 · **ⓑ** 통화 API · **ⓒ** AI 생성 (프롬프트 검토 후 — DECISIONS §2 대기)

| CaseLab 필드 | 원본 | 출처 | 비고 |
|---|---|---|---|
| `id` | `project_project.id` | ⓐ | |
| `name` | `project_project.title` | ⓐ | |
| `client` | `client_clientinfo.company_name` (fallback `client_client.company_name`) | ⓐ | |
| `cat` | `project_field_fieldsubcategory.name` (`is_represent=1` 대표 분야) | ⓐ | 없으면 ⓒ AI 분류 보조 |
| `tech` | `project_project.skills_slug` | ⓐ | 표시용 가공 |
| `budget` (현재) | `project_project.budget` | ⓐ | 본진에서 바뀌면 갱신됨 |
| **검수 시 예산·기간 (원본)** | `project_projectinitialvalue.budget/term` | ⓐ | **변경 추적의 기준점.** 상세 화면 "검수 예산"은 이 값 |
| `period` | `term` + `term_type` | ⓐ | 일 단위 환산 |
| `status` / `stage` | §2 매핑 규칙 | ⓐ | |
| `manager` | `inspection_manager_id` → `auth_user` 이름 | ⓐ | |
| 관여 매니저 전체 | DATA_SCHEMA §13 `caselab_manager_visibility` 조합 | ⓐ | "내 케이스 추적"용 역정규화 |
| `updated` / `daysAgo` | `date_modified` | ⓐ | |
| `contractAmount` | `agreement_agreement.agreement_price` | ⓐ | `hide=0`, `date_deleted IS NULL` |
| `contractPeriod` | `sub_contract_subcontract` 기간 관련 | ⓐ | 원계약(`is_incomplete_addon=0`) 기준 |
| `cancel.reason` | `management_cancel_reason`, `cancel_type` | ⓐ | 부족하면 ⓒ 노트 요약 보조 |
| `intake.posting` (원문) | `project_project.description` | ⓐ | 공고 원문 텍스트 |
| `intake.posting` (구조화) | description 파싱 | ⓒ | 실패 시 원문 그대로 표시 |
| `intake.call` (통화 요약) | 통화 API `summary` | ⓑ | 원문(`transcript`)·전화번호는 **전송 자체를 안 함** |
| `meeting` (미팅 메타) | `meeting_meeting` | ⓐ | → `timeline_events(source='meeting')` |
| `meeting.summary` (AI 요약) | 녹취 기반 | ⓒ | |
| `issueLog` | 녹취·`management_managenote` 기반 추출 | ⓒ | 핵심 AI 기능 |
| `riskTags` | 녹취·노트 기반 분류 | ⓒ | |
| `qna` | `comment_projectcomment` + `comment_commentreply` (`status=1` 공개만) | ⓐ | → `timeline_events(source='qna')`, meta에 작성자·단계 |
| `timeline` | 노트·미팅·계약·마일스톤·상태전환·**변경이력** 통합 | ⓐ | `timeline_events` 테이블 |
| 완료 리뷰 | — (CaseLab 고유) | 자체 | 본진에 없음 |

**통화 ↔ 프로젝트 매핑**: 통화 API는 전화번호 기반 조회만 가능(DATA_SCHEMA §8). **n8n 워크플로 내부에서** `client_clientinfo.cell_phone_number`로 조회 → 응답에 포함된 `project_id`로 매핑 → CaseLab에는 `project_id`·요약만 전송. 전화번호는 n8n 밖으로 나가지 않는다. `project_id`가 없는 통화는 버린다.

---

## 4. CaseLab Postgres 스키마 (DDL)

```sql
CREATE EXTENSION IF NOT EXISTS vector;   -- pgvector: 유사사례 검색 (같은 DB, 별도 벡터DB 없음)

-- 본진 스냅샷 (미러) + 임베딩
CREATE TABLE projects (
  id                 BIGINT PRIMARY KEY,        -- project_project.id 그대로
  title              TEXT NOT NULL,
  client_name        TEXT,
  category           TEXT,
  tech               TEXT,
  budget             NUMERIC,                   -- 현재 예산 (본진 최신값)
  term_days          INT,                       -- 현재 기간
  initial_budget     NUMERIC,                   -- 등록 시 원본 (projectinitialvalue) — 변경 추적 기준
  initial_term_days  INT,
  status             TEXT NOT NULL,             -- CaseLab 6단계
  stage              SMALLINT NOT NULL,
  inspection_manager TEXT,
  manager_ids        JSONB,                     -- 관여 매니저 전체 (visibility)
  contract_amount    NUMERIC,
  contract_term_days INT,
  cancel_stage       TEXT,
  cancel_reason      TEXT,
  posting_raw        TEXT,                      -- description 원문
  content_hash       TEXT,                      -- 임베딩 대상 텍스트의 해시 (재임베딩 판단 기준)
  embedding          VECTOR(1536),              -- NULL이면 미처리 (백필 재개 기준)
  embedding_model    TEXT,                      -- 모델 교체 시 재임베딩 대상 식별
  embedded_at        TIMESTAMPTZ,
  deleted_at         TIMESTAMPTZ,               -- 본진 소프트삭제 반영 (행은 보존, 목록에서 숨김)
  hidden             BOOLEAN NOT NULL DEFAULT false,  -- management_hide 반영
  source_modified_at TIMESTAMPTZ,               -- 본진 date_modified
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_modified ON projects (source_modified_at DESC);
CREATE INDEX idx_projects_status   ON projects (status);
-- 전화번호는 저장하지 않음 — CaseLab으로 전송 자체가 안 됨 (§3)

-- 타임라인 이벤트 (여러 원본 + 자동 생성 이벤트 통합)
CREATE TABLE timeline_events (
  id         BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES projects(id),
  source     TEXT NOT NULL,      -- 'managenote'|'meeting'|'contract'|'milestone'|'qna'
                                 -- |'status'(상태 전환, 서버 생성)|'change'(예산·기간 등 변경, 서버 생성)
  source_id  TEXT NOT NULL,      -- 원본 PK 또는 서버 생성 키 (멱등성)
  event_at   TIMESTAMPTZ NOT NULL,
  stage      TEXT,
  title      TEXT,
  body       TEXT,
  meta       JSONB,              -- change: {field, before, after} / qna: {by, at_stage}
  UNIQUE (source, source_id)
);
CREATE INDEX idx_timeline_project ON timeline_events (project_id, event_at);

-- 통화 요약 (PII 없음: 전화번호·원문 미수신)
CREATE TABLE calls (
  id             BIGINT PRIMARY KEY,   -- 통화 API의 id
  project_id     BIGINT REFERENCES projects(id),
  call_type      TEXT,
  call_time_secs INT,
  summary        TEXT,                 -- 통화 API 제공 요약 (별도 LLM 비용 0)
  drive_url      TEXT,                 -- 원문 필요 시 이 링크로만 접근 (사내 권한)
  created_at     TIMESTAMPTZ
);
CREATE INDEX idx_calls_project ON calls (project_id, created_at);

-- 완료 리뷰 (CaseLab 고유)
CREATE TABLE reviews (
  project_id BIGINT PRIMARY KEY REFERENCES projects(id),
  checks     BOOLEAN[] NOT NULL,
  comment    TEXT,
  saved_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI 산출물 (프롬프트 검토 후 — 스키마만 선반영)
CREATE TABLE ai_insights (
  project_id         BIGINT PRIMARY KEY REFERENCES projects(id),
  risk_tags          TEXT[],
  issue_log          JSONB,   -- [{type, date, src, text}]
  meeting_summary    JSONB,   -- [{meeting_id, bullets[]}]
  posting_structured JSONB,
  model              TEXT,
  generated_at       TIMESTAMPTZ
);

-- 소스별 동기화 커서 — 커서의 단일 진실(single source of truth)
CREATE TABLE sync_state (
  source       TEXT PRIMARY KEY,   -- 'projects'|'managenote'|'meetings'|'qna'|'calls'
  cursor_value TEXT,               -- 복합 커서: "2026-07-10T12:00:00Z|154234" (ts|id)
  last_run_at  TIMESTAMPTZ
);
```

---

## 5. 동기화 스펙

### 두 단계 구조

**Phase 1 — 초기 백필 + 임베딩 (딱 1회):**
1. `projects` 백필 — 최근 1년, 500건씩 페이징. `projectinitialvalue`(등록 시 원본) 포함
2. `timeline_events` 백필 (노트·미팅·계약·Q&A) — **반드시 projects 이후** (FK)
3. `calls` 백필 — n8n이 전화번호로 조회, project_id+요약만 전송
4. 임베딩 배치 — `embedding IS NULL` 행을 소배치(수십 건)로 반복 처리. **중단돼도 그 자리부터 재개** (Vercel 함수 타임아웃 대응)
5. → 화면 실데이터 전환

**Phase 2 — 증분 동기화 (상시):**
1. 15분마다 복합 커서 이후 변경분만 조회 → upsert. **삭제·숨김 행도 포함**해서 마킹
2. 새 통화·노트·미팅·Q&A만 추가
3. **`content_hash`가 바뀐 프로젝트만** 재임베딩 (상태만 바뀐 건 재임베딩 안 함)
4. → 넘긴 뒤의 변화가 계속 쌓임 (목표 2)

### 서버 측 변경 감지 (upsert 시 자동, ★목표 2의 핵심)

`/api/sync/projects`가 upsert할 때 기존 행과 비교(diff)해서 `timeline_events`를 자동 생성한다:

| 감지 | 생성 이벤트 | 예 |
|---|---|---|
| `status` 변경 | `source='status'` | "모집 → 계약" |
| `budget` 변경 | `source='change'`, meta `{field:'budget', before, after}` | "예산 4,500 → 6,000만원" |
| `term_days` 변경 | `source='change'` | "기간 45 → 60일" |
| `contract_amount` 변경 | `source='change'` | 특약 증액 반영 |

`source_id = "{project_id}:{field}:{event_at}"`로 멱등성 보장. **덮어쓰기 전에 이벤트를 남기므로 "무엇이 어떻게 바뀌었는지"가 절대 유실되지 않는다.**

### 수신 엔드포인트 (push 기준)

| 엔드포인트 | 동작 |
|---|---|
| `GET /api/sync/cursor?source=projects` | 현재 커서 반환 — n8n은 **매 실행 시작 시 이걸 조회** (커서 이중 관리 금지) |
| `POST /api/sync/projects` | id 기준 upsert + diff 이벤트 생성 → `{upserted, cursor}` 반환. **성공 응답 후에만 커서 전진** |
| `POST /api/sync/timeline` | (source, source_id) upsert. 미존재 project_id는 skip 카운트로 반환 → 다음 주기 재시도 |
| `POST /api/sync/calls` | id 기준 upsert. project_id 없는 레코드는 n8n에서 이미 제외 |

- 인증: `X-CaseLab-Key` 헤더 (환경변수). 배치 최대 500건
- pull 확정 시 같은 페이로드 형식을 n8n 웹훅 응답으로 재사용

### 복합 커서 (경계 유실 방지)

같은 `date_modified`를 가진 행이 배치 경계에 걸리면 단순 `>` 커서는 행을 놓친다. 커서를 `(ts, id)` 쌍으로:

```sql
WHERE (p.date_modified > :ts) OR (p.date_modified = :ts AND p.id > :id)
ORDER BY p.date_modified ASC, p.id ASC
LIMIT 500;
```

### n8n 증분 조회 SQL 초안 (projects)

```sql
SELECT p.id, p.title, p.description, p.budget, p.term, p.term_type,
       p.status, p.is_cancelled, p.is_rejected,
       p.date_modified, p.date_submitted, p.date_start_recruitment,
       p.date_cancelled, p.date_rejected, p.date_deleted, p.management_hide,
       p.inspection_manager_id, p.management_manager_one_id, p.management_manager_two_id,
       p.skills_slug, p.client_id,
       iv.budget AS initial_budget, iv.term AS initial_term
FROM project_project p
LEFT JOIN project_projectinitialvalue iv ON iv.project_id = p.id
WHERE ((p.date_modified > :ts) OR (p.date_modified = :ts AND p.id > :id))
  AND p.status NOT IN ('open', 'saved', 'frozen')
ORDER BY p.date_modified ASC, p.id ASC
LIMIT 500;
```

> ⚠️ `date_deleted IS NULL` 필터를 **넣지 않는다.** 삭제된 행도 가져와서 CaseLab에 `deleted_at`을 마킹해야 이미 동기화된 프로젝트의 삭제가 반영된다. (백필에서만 삭제 제외 가능)
>
> 클라이언트명·분야·계약·매니저 이름 조인은 워크플로 등록 시 상세 명세로 제공.

### 주기

| 대상 | 주기 | 커서 |
|---|---|---|
| projects 증분 | 15분 | `(date_modified, id)` |
| managenote / meetings / qna | 15분 | `(date_created, id)` 등 |
| calls | 1시간 (완료 아닌 프로젝트만) | `(created_at, id)` |
| 초기 백필 | 1회 | 최근 1년, 500건씩 |

---

## 6. AI·임베딩 비용 정책

| 대상 | 처리 시점 | 예상 비용 |
|---|---|---|
| 임베딩 백필 (1년 ≈ 1~1.5만 건) | Phase 1에서 1회 | **$1 미만** (text-embedding-3-small 기준) — 걱정할 수준 아님 |
| 재임베딩 | `content_hash` 변경 시만 | 미미 |
| 통화 요약 | **비용 0** — 통화 API가 이미 제공 | — |
| 이슈 추출·리스크 태그 (LLM) | 신규·진행 건 자동, 과거 건은 유사사례 히트 시 on-demand | 프롬프트 확정 후 산정 |
| 공고문 구조화 | 상세 최초 조회 시 1회 → `ai_insights` 캐시 | 미미 |

유사사례 검색: `ORDER BY embedding <=> :query_vec LIMIT 5` (코사인 거리). 수만 건까지는 인덱스 없이 exact scan으로 충분 — HNSW 인덱스는 필요해질 때 추가.

> AI 프롬프트 자체는 사용자 검토 전까지 구현 보류 (DECISIONS §2). 스키마·훅 자리만 선반영.

---

## 7. 개발팀 확인 필요 사항

| # | 질문 | 결정되는 것 |
|---|---|---|
| 1 | n8n → 외부 인터넷 아웃바운드 HTTP 가능? | push 가능 여부 (가능하면 push 확정) |
| 2 | n8n 웹훅 외부(공개 URL) 호출 가능? | pull 가능 여부 |
| 3 | n8n에 read replica SELECT 커넥션 존재? | 조회 파이프라인 |
| 4 | n8n → 통화 API(192.168.10.217) 호출 가능? | 녹취 파이프라인 |
| 5 | 통화 **요약**의 외부 클라우드 저장 가능 여부 (원문·전화번호는 애초에 전송 안 함) | `calls.summary` 저장 여부 |
| 6 | n8n 크론 워크플로 추가 가능? 주기 제약? | 동기화 주기 |

---

## 8. 검토에서 의도적으로 채택하지 않은 것 (과설계 방지)

| 후보 | 결정 | 이유 |
|---|---|---|
| 메시지 큐 (Kafka/SQS) | 안 씀 | 15분 폴링 + 멱등 upsert로 충분한 규모. 큐는 운영 부담만 추가 |
| 별도 벡터 DB (Pinecone 등) | 안 씀 | 1~2만 건은 pgvector로 충분, 인프라 1개 절약 |
| 본진 상태 변경 실시간 웹훅 | 지금은 안 함 | 본진 수정 필요. 15분 지연 허용 가능. 필요 시 나중에 추가해도 구조 동일 |
| HNSW 벡터 인덱스 | 나중에 | 수만 건까지 exact scan 충분 |
| 매니저 로그인/권한 | 나중에 | MVP 1인 사용. `manager_ids` 컬럼으로 데이터 준비만 해둠 |
| 임베딩 대상 텍스트 AI 정제 ("개념적 매칭") | 나중에 | 프롬프트 검토 대기. 원문 임베딩으로 시작, 교체 시 `embedding_model`로 구분 재처리 |

---

## 9. 적용 순서

1. ✅ 이 설계 문서 확정 (최종 검토 완료)
2. CaseLab DB 프로비저닝 (Neon/Supabase — pgvector 지원) + §4 DDL 적용
3. `/api/sync/*` 엔드포인트 + upsert + **diff 이벤트 생성** 구현
4. 어댑터에 `PostgresDataSource` 추가 (mock과 병행, 환경변수 전환)
5. 개발팀 답변 수신 → n8n 워크플로 상세 명세 작성 → 등록
6. **Phase 1 백필** (최근 1년) → 임베딩 배치 → 화면 실데이터 전환
7. **Phase 2 증분 동기화** 가동 (15분 크론)
8. (프롬프트 검토 후) AI 파이프라인 연결 → `ai_insights` 채움
