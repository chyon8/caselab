# CaseLab 백필 런북 (2026-07-14, 2026-07-15 업데이트)

> 순서대로 그대로 따라 하면 된다. 순서를 바꾸면 커서가 멈춘다.
> 설계 근거는 [DATA_INTEGRATION.md](./DATA_INTEGRATION.md), 원본 스키마는 [DATA_SCHEMA.md](./DATA_SCHEMA.md).

---

# ✅ 계약 업무범위 실물 확인 — 완료 (2026-07-15)

**결론: `work_scope`/`work_detail` 텍스트 미러링은 보류. 대신 특약의 숫자(`total_price`·`date_contracted`)와
`milestone_milestone`의 예정일/실제일만 가져온다.** 상세는 아래
[④ 특약(subcontracts) — 계약 내용의 숫자만 가져온다](#④-특약subcontracts--계약-내용의-숫자만-가져온다-2026-07-15-확정) 참고.

**확인한 것:** agreement_id 24112 / subcontract_id 21744 실물 1건 — `work_scope`, `work_detail` 원문 확보.
**아직 안 돌린 것:**
- **① 채움 분포 쿼리** (전체 계약에서 형식이 이 샘플처럼 일관된지) — 텍스트 미러링을 보류했으므로 지금은
  불필요. 나중에 텍스트 추출 작업을 다시 꺼낼 때 실행한다.
- **③ 마일스톤 쿼리** (`contract_date_*` vs 실제 `date_*` — "계약대로 갔나, 며칠 밀렸나") — **여전히 유효하다.**
  AI 없이 뺄셈만으로 되는 숫자 데이터라 ④의 숫자 pull에 같이 넣는다. 원래 쿼리는 아래 참고.

  ```sql
  SELECT m.contract_id, m.title, m.price, m.work_period, m.tally_period,
         m.contract_date_start, m.contract_date_end,
         m.date_start, m.date_tally, m.date_end,
         LEFT(m.tally_condition, 200) AS tally_sample
  FROM milestone_milestone m
  JOIN sub_contract_subcontract sc ON sc.id = m.contract_id
  JOIN agreement_agreement a       ON a.id = sc.agreement_id
  WHERE a.project_id IN (154633, 156821)
  ORDER BY a.project_id, m.id;
  ```

## 왜 텍스트 미러링을 보류하나

원래 가정(`work_scope`가 순수 텍스트라 파서 없이 그대로 미러링 가능)이 **틀렸다.** 실물은 7~8단
중첩된 `<li>/<ul>` HTML 프래그먼트고, wrapping 태그 없는 malformed 조각이었다. 여기서 멈추지 않고
직접 프로토타입(상세화면에 `dangerouslySetInnerHTML`로 렌더)까지 만들어 확인했고, 결론은 보류다.
이유:

1. **최고 신호("필요 요소" 8축: 기획/디자인/API/…)는 이미 있다.** `project_project_categories`
   (→ CaseLab `devScope`)가 사실상 같은 정보를 더 가볍게 이미 들고 있다. 증분 정보가 생각보다 작다.
2. **원문 접근은 이미 있다.** 상세화면의 [계약 어드민 ↗](./src/features/projects/ProjectDetail.tsx#L128)
   링크로 원본을 볼 수 있다. CaseLab이 계약서 뷰어를 다시 만들 이유가 약하다.
3. **원문의 70~80%가 전 계약 공통 보일러플레이트다.** "도급인이 승인한 결과물 기준으로 개발" 같은 문구가
   기획/디자인/API/클라이언트 개발마다 복붙돼 있다. de-boilerplate 가공 없이 그대로 뿌리면 노이즈였다 —
   프로토타입 렌더로 직접 확인.
4. **회고적 데이터다.** `work_scope`는 계약 **체결 이후**에만 생긴다. 검수 매니저의 실시간 판단
   (검수→모집 구간)엔 안 쓰인다.

## "미팅 녹취 vs 통화" — 2026-07-15 정정

> ⚠️ **아래 원래 결론은 STALE하다.** 같은 날 `/api/meetings/` 엔드포인트가 새로 발견되면서 뒤집혔다.

**원래 결론 (STALE, 참고용으로만):** "둘은 별개 데이터가 아니다. 위시켓에 '미팅 녹취'라는 독립 소스는 없다."
→ by-phone 통화 API만 존재한다고 판단했을 때의 결론이다.

**정정된 결론 (2026-07-15):** **별개 데이터다. 두 소스가 병존한다.**

| | `calls` (by-phone) | `meetings` (/api/meetings/) |
|---|---|---|
| 엔드포인트 | `GET /api/calls/by-phone/?phone=` | `GET /api/meetings/?project_id=` |
| 매칭 방식 | 전화번호 → project_id 추측 | project_id **직접** 매칭 |
| 특징 | confidence 필터 필요, 남의 프로젝트 섞임 | confidence 개념 없음, 오매핑 없음 |
| 참여자 | 매니저↔클라이언트 or 매니저↔파트너 (양자 통화) | 매니저·클라·파트너 **3자 미팅** 전문 |
| CaseLab 테이블 | `calls` | `meetings` (migration 009) |
| n8n 파이프라인 | [`calls_pipeline.md`](./calls_pipeline.md) | [`meetings_pipeline.md`](./meetings_pipeline.md) |

둘은 같은 서버(192.168.10.217)에서 오지만 응답 구조·소스·의미가 다르다. `calls`는 매니저의 1:1 통화, `meetings`는 프로젝트 관련 3자 미팅 녹취다.

5. **§④가 원래 원하려던 "과업 팽창률"은 텍스트가 아니라 숫자(`total_price`)로 나온다.** AI도 파싱도 필요 없다 — 관통 원칙(§⑥ 하단) 그대로: 숫자는 SQL이 공짜다.

**재개 조건:** 임베딩/추출 파이프라인 착수 시(대기 결정 #2, AI 프롬프트 검토 이후) 다시 꺼낸다.
그때 첫 타깃은 **"제외 범위"** 섹션 — "공고엔 있었는데 계약에서 협의로 빠진 것"의 직접 증거라
신호가 가장 높다. 나머지 보일러플레이트는 여러 계약이 모여야 자동 검출·제거가 가능하므로 단건으로는
착수하지 않는다.

---

# 📞 통화 녹취 파이프라인 — 50개 테스트 완주 (2026-07-15)

> ↑ 위 섹션에 2026-07-15 정정 내용이 있다 — 미팅 녹취와 통화는 **별개 소스**임이 확인됨.

## project_id null / confidence null 정체

- **DB에 project_id가 null인 통화는 0건.** n8n에서 project_id=null 통화가 넘어와도 CaseLab이 매칭 불가로 버린다(skipped에 포함). DB는 안 더럽혀졌다.
- **confidence=null 226건**(전체 633건 중)은 `transcript`·`call_type`·`summary`가 전부 빈 **껍데기 레코드**다. 녹음/STT가 없는 통화 로그(부재중·미녹음 추정). project_id는 있어서 적재는 됐지만 내용이 없다.

## 오늘 한 것 (배관 검증)

- `migrations/007`(transcript, user_type) / `008`(confidence) — Neon 적용 확인
- `route.ts` — transcript·confidence 수신, confidence=low 필터, **project_id=null 500 크래시 수정**(커밋 `86c4435`)
- n8n 4노드 파이프라인 세팅 완료 — ③ Code는 `{rows:[…]}` 감싸기, ④ Body는 `{{ JSON.stringify($json) }}`
- **50개 테스트 완주:** upserted 635 / skipped 309. Neon 최종 633건 (2026-03-04 ~ 2026-07-15)
- `n8n/calls_phones_test.sql` — 50개 한정 테스트 쿼리(MariaDB용 ROW_NUMBER). 검증 끝나면 버려도 됨

## 내일 할 일 (통화 트랙)

1. **UI 실물 확인** — ProjectDetail 화면에서 통화 여러 건이 안 깨지고 뜨는지. 아직 눈으로 확인 못 함. transcript 있는 프로젝트(예: project_id 156665, 통화 3건) 열어볼 것.
2. **껍데기 226건 처리 결정** — transcript·summary 둘 다 null인 통화를 적재 단계에서 버릴지(route.ts에 필터 한 줄), 아니면 "통화는 있었으나 미녹음" 증거로 남길지.
3. **전체 백필 실행** — ① 노드를 `calls_phones_test.sql`(50개) → **`calls_phones.sql`**(운영용, 60일 롤링)로 교체. 전화번호 훨씬 많음(이전 1,415개), 배칭 1초면 ~24분. 완주 후 Neon 재검증.
4. **Schedule Trigger 전환** — 검증되면 매일 새벽 1회 자동 실행으로. 백필 워크플로 그대로 재사용.
5. **대기 결정 #1 해소됨** — 아래 "대기 중인 결정" #1(통화 요약 외부 저장 승인)은 2026-07-15 "원문까지 받는다" 결정으로 사실상 처리됨. 표에서 정리 필요.

## 🆕 사전 미팅 녹취 파이프라인 — 구현 완료, n8n 실행 대기 (2026-07-15)

**완료된 것:**
- `migrations/009_meetings.sql` → Neon 적용 완료 (빈 테이블)
- `src/app/api/sync/meetings/route.ts` — POST 수신 라우트 구현 + **E2E curl 테스트 통과** (`upserted:1` 확인)
- `src/data/postgres.ts` — `toMeetingRecord()` + `getProject()` meetings 조인 쿼리
- `src/features/projects/ProjectDetail.tsx` — `MeetingCard` + meetings 섹션 렌더링
- `n8n/meetings_pipeline.md` — 6노드 워크플로 문서
- `n8n/meeting_project_ids.sql` — ① 노드용 project_id 조회 SQL

**남은 것:**
1. **Neon 테스트 데이터 정리** — curl 테스트로 삽입된 id=99001 행 삭제 + 커서 초기화:
   ```sql
   DELETE FROM meetings WHERE id = 99001;
   DELETE FROM sync_state WHERE source = 'meeting_transcripts';
   ```
2. **n8n 미팅 워크플로 실행** — 내부망에서 6노드 워크플로 만들고 Execute 한 번. 문서: [`meetings_pipeline.md`](./n8n/meetings_pipeline.md)
3. **UI 실물 확인** — meetings 데이터 들어온 후 ProjectDetail 화면에서 "사전 미팅 녹취록" 섹션 표시 확인.
4. **이슈로그 LLM 추출** — 다음 단계 (대기 결정 #2 이후).

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

### ⓪ Q&A 댓글 유실 (2026-07-14 발견, 2026-07-15 진단) — **Neon-only 트랙 (사내망 세션과 별개, 나중/집에서)**

**증상:** 백필 후 여러 프로젝트의 Q&A가 통째로 비어 있다 (예: project 156821, 그 외 다수).
프로젝트 자체는 목록에 정상적으로 뜬다.

**실측 (2026-07-15 갱신):**

| | 값 |
|---|---|
| 현재 범위 본진 Q&A 원본 | **17,098건** (커서 시점까지 17,063 + 커서 이후 35) |
| Neon `timeline_events` source='qna' | **16,717건** |
| **실제 누락** | 커서 시점까지 대비 **346건.** (기존 "4,607 부족"은 예상치 21,324가 틀린 것 — 실범위는 17,098) |
| 커서값 | `...\|97447` — 그런데 Neon에 그 다음 `97448`이 이미 있다 |

**fallback 날짜 = 무죄 (기각).** project 156821은 본진 댓글 12개 중 Neon에 **마지막 2개만** 있고 앞 10개는
커서 이전인데도 없다. fallback 날짜 문제였다면 특정 시점 이전이 **통째로** 빠져야 하는데, "앞 10개 없고 뒤
2개만"은 시점 경계로 설명되지 않는다. 화면 문제도 아니다 (Neon 자체에 없음).

**1순위 용의자 (교체) — n8n이 본진 응답 `data` 전체를 CaseLab POST `rows`로 안 보냈는데 커서만 전진.**
③ 조회는 배치 전량을 리턴했는데 ④ 적재로 넘길 때 일부만 실렸고, 커서는 배치의 max id까지 전진했다 →
안 실린 행은 skip=0인 채 **영구 누락.** CaseLab 라우트/[`cursor.ts`](./src/lib/sync/cursor.ts)는 정상(실측).
원인은 n8n ③→④ 사이 데이터 매핑/페이징에 있다.

**추가 의심 — 커서 레이스.** 커서 97447인데 Neon에 97448이 이미 있다 → 동시 실행/수동 실행으로 커서가 뒤로
꼬였을 가능성. 확인 필요.

**고치기 (판별 순서):**

1. **누락 346건 id 특정** — 본진 범위 id 집합 − Neon id 집합.
2. **n8n ③→④ 매핑 점검** — ③ 응답 `data.length`와 ④로 보낸 `rows.length`가 같은지 실행 로그로 확인.
   다르면 그게 원인이다 (배치 트렁케이션).
3. **커서 단일 실행 보장** — 동시/수동 실행 금지 + 커서를 "실제 POST된 max id"로만 전진.
4. **누락분 재적재** — 독립 워크플로라 projects 재백필 불필요.

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

### ④ 특약(subcontracts) — 계약 내용의 숫자만 가져온다 (2026-07-15 확정)

지금 화면의 계약 정보는 `contractAmount` 칩(= `agreement_price` 총액) 하나뿐이다.
`sub_contract_subcontract`가 나오는 곳은 `projects_incremental.sql`의 `has_valid_agreement`
EXISTS 서브쿼리 하나뿐이고, 거긴 "존재하냐"만 볼 뿐 컬럼을 SELECT하지 않는다.

**가져올 것 (전부 숫자·날짜 컬럼 — AI도 파서도 필요 없다):**

| 컬럼 | 내용 |
|---|---|
| `sub_contract_subcontract.total_price` / `date_contracted` | 특약별 금액·체결일 |
| `milestone_milestone.contract_date_start/end` vs `date_start/tally/end` | 차수별 예정일 vs 실제일 — 지연 분석 |

**보류 (텍스트, 위 "계약 업무범위 실물 확인" 참고):**

| 컬럼 | 왜 지금 안 가져오나 |
|---|---|
| `sub_contract_subcontract.work_scope` / `work_detail` | 7~8단 중첩 HTML, 70~80%가 보일러플레이트, 최고 신호(필요 요소 8축)는 `devScope`에 이미 있음. 원문은 계약 어드민 링크로 접근 가능 |
| `milestone_milestone.title` / `price` / `tally_condition` | 차수별 과업명·검수조건은 텍스트라 위와 같은 이유로 보류. `price`(숫자)는 위 표에 포함해도 무방 |

계약 후 과업 팽창률. `agreement_price`는 총액이라 "5,300만 원계약 + 채팅 특약 500만"인지
"5,800만 한 방"인지 구분이 안 된다. **이걸 아는 유일한 원천이 특약 행의 숫자다.**

> **계약 첨부파일은 파싱하지 않는다 (2026-07-14 확정).** `project_projectfile`은 S3 FileField라
> signed URL 생성이 앱 레벨에 있어 n8n에서 못 뽑고, PDF/HWP 파서까지 붙이면 5,993건 × 여러 파일로
> 비용이 급증한다. 상세 화면엔 어드민 링크만 건다.

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
