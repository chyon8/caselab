# 사전 미팅 녹취 동기화 (n8n 워크플로)

통화 녹취(by-phone, [`calls_pipeline.md`](./calls_pipeline.md))와 **별개 파이프라인**이다. 같은 통화 API 서버
(192.168.10.217)에서 오지만 **엔드포인트·데이터가 다르다**: by-phone 은 전화번호로 한쪽 통화를 주고,
`/api/meetings/` 는 **project_id 로 매칭해 3자(매니저·클라·파트너) 전문**을 준다.

> **왜 이게 더 단순한가:** by-phone 은 전화번호 hop·confidence 추측·남의 프로젝트 섞임을 CaseLab 이
> 필터로 막아야 했다. 미팅 API 는 project_id 로 바로 조회되므로 그 방어가 통째로 없다.
>
> **역할 분담:** n8n 은 데이터만 나른다. 딱 하나 **member_name(우리 매니저명) 제거만 n8n(⑧)에서** 한다 —
> CaseLab 에 도착하는 순간 이미 PII 라 옮길 수 없다. summary·transcript 스크럽(전화/이메일/주민번호)은
> CaseLab `/api/sync/meetings` 라우트가 한다.
>
> **실행:** 스케줄 트리거 또는 수동("Execute Workflow") 모두 같은 롤링 윈도우(최근 60일)를 재스캔한다.
> 크론을 걸어도 매번 전량 재조회 + 멱등 upsert 라 무해하다.

## 노드 구성 (9개)

```
① Trigger (Schedule 또는 Manual)
        ↓
② HTTP GET  CaseLab /api/sync/cursor?source=meeting_transcripts   ← 표시용 커서 (③은 안 씀)
        ↓
③ HTTP POST 본진 /query  (meeting_project_ids.sql)               → [ {project_id, event_cursor_at, event_cursor_id}, … ]
        ↓
④ Code      .data 봉투 벗기고 project_id 중복 제거               → [ {project_id}, … ]
        ↓
⑤ HTTP GET  미팅 API (목록)  ?project_id=  (행마다 반복)          → 각 응답 [{ project_id, total, results[] }]
        ↓
⑥ Code      results 펼쳐 미팅 id 만 추림 (+ 빈 배치 센티넬)       → [ {id}, … ]
        ↓
⑦ HTTP GET  미팅 API (단건)  ?id=  (행마다 반복)                  → 각 응답 [{ id, project_id, transcript, … }]
        ↓
⑧ Code      배열 언랩 + member_name 제거 + 커서 계산 + 배치       → [ {rows:[…], cursor}, … ]
        ↓
⑨ HTTP POST CaseLab /api/sync/meetings (배치마다 반복)           → 라우트가 스크럽·upsert
```

n8n HTTP 노드는 **들어온 행마다 한 번씩** 자동 실행되므로 ⑤·⑦·⑨에 별도 루프 노드가 필요 없다.

> ⚠️ **⑤·⑦ 은 반드시 Batching 을 켠다.** ④가 60일 윈도우의 프로젝트 전부(수십~수백 건)를 한 번에
> 흘려보내면, 미팅 API 서버(192.168.10.217:8000)가 동시 연결을 감당 못 하고 일부를 `ECONNREFUSED`
> 로 거부한다 — 그러면 그 프로젝트만 조용히 누락된다(156571 이 이 이유로 빠졌었다). HTTP Request
> 노드 옵션 → **Batching: Items per Batch = 1, Batch Interval ≈ 200~500ms**. (필요하면 Retry On Fail 도.)

---

### ① Trigger

Schedule Trigger(정기) 또는 Manual Trigger(수동). 백필·정기 실행 구분이 없다 — 어느 쪽이든 ③이 최근
60일을 통째로 재스캔한다.

---

### ② HTTP GET — 커서 조회

| 항목 | 값 |
|---|---|
| Method | `GET` |
| URL | `https://<caselab>/api/sync/cursor?source=meeting_transcripts` |
| Header | `X-CaseLab-Key: <CASELAB_SYNC_KEY>` |

→ `{ "source": "meeting_transcripts", "ts": …, "id": … }`.

> **커서는 표시용에 가깝다.** ③ 쿼리 WHERE 절이 이 값을 참조하지 않는다(매번 60일 전량 재스캔).
> 그래도 ⑧이 sync_state 를 전진시켜 "마지막으로 어디까지 훑었나"를 남긴다. 자세한 이유는
> [`meeting_project_ids.sql`](./meeting_project_ids.sql) 헤더 주석 참고.

---

### ③ HTTP POST — 본진 조회 (in-scope 목록 + 워터마크)

| 항목 | 값 |
|---|---|
| Method | `POST` |
| URL | `http://wishket-api-server:8001/query` |
| Body | projects 워크플로와 **같은 형식** ([`meeting_project_ids.sql`](./meeting_project_ids.sql) 붙여넣기) |

→ 결과: `{ project_id, event_cursor_at, event_cursor_id }` 행. `meeting_meeting` 을 JOIN 하므로 한
프로젝트에 미팅이 여러 건이면 그만큼 행이 나온다(④에서 project_id 중복 제거). `ORDER BY date_created ASC`
라 **마지막 행이 이번 스캔의 최신 워터마크** — ⑧이 그걸 커서로 쓴다.

> 노드 이름을 **`본진조회`** 로 둔다 — ⑧ 코드가 `$('본진조회')` 로 이 노드 출력을 되짚는다.

---

### ④ Code — 봉투 벗기고 project_id 중복 제거

Mode: **Run Once for All Items**. 본진 `/query` 응답은 `{ data:[…] }` 로 한 겹 감싸져 온다 — 벗긴다.

```js
const seen = new Set();
const out = [];
for (const item of $input.all()) {
  for (const row of (item.json.data || [])) {   // ① .data 봉투 벗기기
    const pid = row.project_id;
    if (!seen.has(pid)) {
      seen.add(pid);
      out.push({ json: { project_id: pid } });
    }
  }
}
return out;
```

---

### ⑤ HTTP GET — 미팅 목록  ⚠️ Batching 필수

| 항목 | 값 |
|---|---|
| Method | `GET` |
| URL | `http://192.168.10.217:8000/api/meetings/` |
| Query `project_id` | `={{ $json.project_id }}` |
| Options | **Batching: Items per Batch 1 / Interval 200~500ms** |

→ 응답: `[{ project_id, total, results:[ {id, title, partner_slug, …} ] }]` (전문 제외). 미팅 없으면 `total:0`.

---

### ⑥ Code — 미팅 id 펼치기 (+ 빈 배치 센티넬)

Mode: **Run Once for All Items**. 각 응답의 `results[]` 를 펼쳐 **미팅 id 만** 넘긴다.

```js
const out = [];
for (const item of $input.all()) {
  for (const mt of (item.json.results || [])) {
    out.push({ json: { id: mt.id } });
  }
}
// 이 배치에 녹취가 하나도 없어도 최소 1개는 흘려보내야 ⑦→⑧→⑨가 실행돼 커서가 전진한다.
if (out.length === 0) out.push({ json: { id: 0 } });   // 존재하지 않는 id — ⑦ 응답이 비어 ⑧에서 걸러짐
return out;
```

---

### ⑦ HTTP GET — 미팅 단건 (전문 포함)  ⚠️ Batching 필수

| 항목 | 값 |
|---|---|
| Method | `GET` |
| URL | `http://192.168.10.217:8000/api/meetings/` |
| Query `id` | `={{ $json.id }}` |
| Options | **Batching: Items per Batch 1 / Interval 200~500ms** |

→ 응답: `[{ id, project_id, partner_slug, summary, transcript, created_at, member_name, … }]`.
**배열로 한 겹 감싸져 온다** — ⑧에서 벗긴다. `transcript` 는 마크다운 회의록(`# 녹취록 … ## 요약 … ## 전문`).

---

### ⑧ Code — 배열 언랩 + member_name 제거 + 커서 계산 + 배치

Mode: **Run Once for All Items**. CaseLab 이 저장하는 필드만 남긴다 — **member_name(매니저명)은 뺀다.**

```js
const all = [];
for (const item of $input.all()) {
  const raw = item.json;
  const m = Array.isArray(raw) ? raw[0] : raw;   // ⑦ 응답이 배열이라 첫 요소를 꺼낸다
  if (!m || (!m.transcript && !m.summary)) continue;   // 센티넬(id:0)·빈 녹취 제거
  all.push({
    id: m.id,
    project_id: m.project_id,
    partner_slug: m.partner_slug,   // 슬러그만 — 개발사 구분용
    summary: m.summary,             // 스크럽은 CaseLab 이 한다
    transcript: m.transcript,       // 스크럽은 CaseLab 이 한다
    match_reason: m.match_reason,
    created_at: m.created_at,
    // member_name(매니저명)·duration_secs·project_title 은 의도적으로 제외 — PII·불필요
  });
}

// ③은 date_created ASC → 마지막 행이 이번 스캔 워터마크. 녹취 0건이어도 커서는 전진시킨다.
const scanRows = $('본진조회').first().json.data;
const last = scanRows[scanRows.length - 1];
const cursor = `${last.event_cursor_at}|${last.event_cursor_id}`;

if (all.length === 0) {
  return [{ json: { rows: [], cursor } }];   // 녹취 없던 배치 — 커서만 전진
}

// ⚠️ transcript 가 무거워 배치를 작게 쪼갠다. 500 이면 Vercel 요청 본문 4.5MB 한도를 넘어 413.
const BATCH = 25;
const out = [];
for (let i = 0; i < all.length; i += BATCH) {
  out.push({ json: { rows: all.slice(i, i + BATCH), cursor } });
}
return out;   // ← return 누락 주의: all.length>0 경로에도 반드시 있어야 한다
```

> **왜 배치 25 인가:** 미팅 전문은 건당 수 KB~수십 KB 다. 500 건이면 수 MB → Vercel 4.5MB 한도
> 초과로 `413 Request Entity Too Large`. 전문이 유난히 긴 배치가 몰려 여전히 413 이면 10 으로 더 줄인다.
>
> **커서 유실 걱정 없음:** 25 건씩 나눈 여러 배치가 전부 같은 `cursor` 를 싣고, 뒤 배치가 실패해도
> ③이 다음 실행에 60일 윈도우를 다시 훑어 재조회 → id upsert 로 멱등 복구된다.

---

### ⑨ HTTP POST — CaseLab 적재

| 항목 | 값 |
|---|---|
| Method | `POST` |
| URL | `https://<caselab>/api/sync/meetings` |
| Header | `X-CaseLab-Key: <CASELAB_SYNC_KEY>` |
| Body (JSON) | `={{ $json }}`  (= `{rows:[…], cursor}`) |

라우트 응답: `{ "upserted": N, "skipped": M, "cursor": … }`.
- `upserted` — 저장된 미팅 수
- `skipped` — 아직 CaseLab 에 없는 프로젝트의 미팅 (projects 워크플로가 먼저 돌면 다음 주기에 적재됨).
  skip 이 하나라도 있으면 라우트가 커서를 전진시키지 않는다.

---

## PII 가드레일 요약

| 항목 | 처리 | 위치 |
|---|---|---|
| member_name(매니저명) | POST row 에서 제외 | **n8n ⑧** (CaseLab 에 도달 안 함) |
| summary·transcript·match_reason | `scrubPii`(전화/이메일/주민번호) | CaseLab 라우트 |
| 이름(전문 속) | 못 잡음 — 알려진 한계 | — |
