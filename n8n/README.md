# n8n 워크플로 — projects 동기화

본진(위시켓) → CaseLab 단방향 push. 이 워크플로 **하나가 백필과 증분을 모두 처리**한다.
커서는 CaseLab이 소유하므로 n8n은 무상태다 — 죽었다 살아나도 그 자리부터 이어간다.

```
① Schedule Trigger (15분) 또는 홈 버튼 Webhook Trigger
        ↓
② HTTP GET  CaseLab /api/sync/cursor?source=projects     ← 어디까지 가져왔는지 물어본다
        ↓
③ HTTP POST 본진 /query  (projects_incremental.sql)      ← 그 이후 변경분 400건 조회
        ↓
④ HTTP POST CaseLab /api/sync/projects                   ← 통째로 넘긴다 (가공은 CaseLab이)
        ↓
⑤ HTTP POST 본진 /query  (proposal_counts_refresh.sql)   ← 모집중 지원수 전량 재조회
        ↓
⑥ HTTP POST CaseLab /api/sync/proposal-counts            ← data 배열을 지원수로 갱신
```

실제 운영 캔버스의 노드명·설정과 복구 절차는 [`projects_pipeline.md`](./projects_pipeline.md)를 참조한다.

---

## ② 커서 조회

| 항목 | 값 |
|---|---|
| Method | `GET` |
| URL | `https://<caselab>/api/sync/cursor?source=projects` |
| Header | `X-CaseLab-Key: <CASELAB_SYNC_KEY>` |

응답:
```json
{ "source": "projects", "ts": null, "id": null }
```
최초 실행은 `ts`/`id`가 `null`이다. 다음 노드에서 1년 전으로 대체한다.

---

## ③ 본진 조회

| 항목 | 값 |
|---|---|
| Method | `POST` |
| URL | `http://wishket-api-server:8001/query` |
| Body | 기존에 쓰던 형식 그대로 (SQL만 교체) |

SQL은 [`projects_incremental.sql`](./projects_incremental.sql). 두 자리에 커서를 주입한다:

```
{{TS}} → {{ $('cursor').item.json.ts || '2025-07-13T00:00:00Z' }}
{{ID}} → {{ $('cursor').item.json.id || 0 }}
```

> `'2025-07-13T00:00:00Z'`가 백필 시작점(= 1년 전)이다. 더 과거까지 원하면 이 날짜만 바꾼다.

**첫 실행은 `LIMIT 400`을 `LIMIT 10`으로 줄여서 돌린다.** 10건이 CaseLab 화면에 뜨면
파이프라인 전체가 검증된 것이고, 그때 400으로 올린다.

---

## ④ CaseLab 적재

| 항목 | 값 |
|---|---|
| Method | `POST` |
| URL | `https://<caselab>/api/sync/projects` |
| Header | `X-CaseLab-Key: <CASELAB_SYNC_KEY>` |
| Body | `{ "rows": <③의 결과 배열> }` |

응답:
```json
{ "upserted": 8, "skipped": 2, "events": 3, "cursor": "2026-07-13T09:00:00Z|154234" }
```
- `upserted` — 저장된 건수
- `skipped` — 등록 전 단계(open/saved/frozen)라 건너뛴 건수
- `events` — **자동 생성된 변경 이력 건수** (예산·상태·담당자 변경 등)
- `cursor` — CaseLab이 기억한 위치. n8n은 이 값을 저장할 필요 없다

---

## 백필 루프 (필요 시 추가)

현재 운영 캔버스에는 IF 루프가 없다. 대량 백필이 필요할 때 ③이 `LIMIT`만큼 꽉 채워 반환하면
아직 따라잡을 게 남았다는 뜻이므로, ④ 뒤에 IF 노드를 달아 ②로 되돌릴 수 있다:

```
IF  ③의 결과 건수 == 400  →  ② 로 루프
    아니면                →  ⑤ 지원수 리프레시
```

무한 루프 방지로 실행당 최대 반복 횟수(예: 60회 = 2.4만 건)를 걸어둔다.
이 루프는 장애로 밀린 데이터를 따라잡을 때도 동일하게 동작한다.

---

## 에러 처리

- 프로젝트 조회·적재(②~④)가 실패하면 커서가 전진하지 않아 다음 주기에 같은 구간을 다시 가져온다.
- 지원수 갱신(⑤~⑥)은 커서가 없는 전량 조회라 실패해도 다음 실행에서 다시 시도한다.
- upsert는 멱등이라 중복 실행해도 데이터가 겹치지 않는다.
- n8n **Error Workflow**를 걸어 실패 시 Slack 알림만 받으면 충분하다.

---

# 메인 워크플로 마지막 단계 — 지원수 리프레시

위 워크플로는 `date_modified` 커서로 돈다. 그런데 **본진은 지원이 들어와도
`project_project.date_modified`를 갱신하지 않는다.** 그래서 모집중인 프로젝트는 한 번
동기화된 뒤 다시 조회되지 않고, `proposal_count`가 그 시점 값에 고정된다.

> 2026-07-29 실측 — 모집 마감 전 65건 중 **36건이 모집 전환 시점 값 그대로**였고
> 그중 16건이 화면에 `지원 0건`으로 표시됐다. 반대로 상태 전환 등으로 `date_modified`가
> 갱신된 건은 정확하다 (계약·진행·완료 1,845건에 지원 0건이 하나도 없다).
> → **망가진 건 "지금 모집 중인 건의 실시간 숫자"뿐이고, 종료된 건의 통계·유사사례는 멀쩡하다.**

이걸 메우는 2노드를 **메인 동기화 워크플로의 일반 프로젝트 적재 뒤**에 붙인다.
그래야 홈의 "지금 동기화" 웹훅을 눌렀을 때 지원수도 같은 실행에서 갱신된다.
projects 커서는 쓰거나 변경하지 않는다.

```
⑤ HTTP POST 본진 /query  (proposal_counts_refresh.sql)   ← 모집중인 건 전량, id·지원수만
        ↓
⑥ HTTP POST CaseLab /api/sync/proposal-counts            ← data 배열로 있는 행만 갱신
```

> 별도 30분 Schedule Trigger를 ⑤에 함께 연결해 자동 갱신을 유지해도 된다. 핵심은 홈 버튼의
> Webhook Trigger에서 시작한 실행도 반드시 ⑤→⑥을 지나도록 연결하는 것이다.

## ⑤ 본진 조회

| 항목 | 값 |
|---|---|
| Method | `POST` |
| URL | `http://wishket-api-server:8001/query` |
| Body | SQL = [`proposal_counts_refresh.sql`](./proposal_counts_refresh.sql) **그대로** (커서 주입할 표현식 없음) |

본진 `/query`는 `{ "success": true, "data": [...] }` 형태의 item 1개를 반환한다.

## ⑥ CaseLab 적재

| 항목 | 값 |
|---|---|
| Method | `POST` |
| URL | `https://<caselab>/api/sync/proposal-counts` |
| Header | `X-CaseLab-Key: <CASELAB_SYNC_KEY>` |
| Body | Expression 모드에서 `{{ { rows: $json.data } }}` |

응답:
```json
{ "received": 286, "updated": 41 }
```
- `received` — 본진에서 넘어온 건수
- `updated` — **실제로 지원수가 달라져 갱신된 건수** (같은 값이면 안 센다)

## 주의

- **projects의 `sync_state` 커서는 건드리지 않는다.** 완료 감지를 위한 `proposal_counts`
  행의 `last_run_at`만 기록하고 `cursor_value`는 NULL로 둔다.
- **INSERT하지 않는다.** id·지원수 두 컬럼뿐이라 새 행을 만들면 반쪽짜리 프로젝트가 생긴다.
  아직 CaseLab에 없는 프로젝트는 projects 워크플로가 곧 온전히 적재한다.
- `content_hash`를 안 건드리므로 **임베딩이 무효화되지 않는다** (재임베딩 비용 없음).
- 실패해도 다음 주기에 전량 다시 읽으므로 재시도·백필 로직이 필요 없다.
- `received`가 10,000이면 지원수 전용 방어 상한에 닿은 것 — 페이지네이션을 붙여야 한다.
