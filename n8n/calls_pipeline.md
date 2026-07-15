# 통화 녹취 동기화 (n8n 워크플로)

projects·qna 와 **같은 패턴**이다: `본진 조회 → CaseLab 적재`. 딱 하나 다른 건, 통화는 본진이 아니라
**통화 API(192.168.10.217)** 에서 오고 그 API가 **전화번호로만 조회**되므로, 본진에서 번호를 먼저 뽑아
그 번호로 통화 API를 부르는 **한 hop**이 중간에 들어간다.

> **왜 n8n 인가 (스크립트 아님):** 본진(`wishket-api-server`)은 **n8n 내부 네트워크 이름**이라
> 노트북 터미널에선 DNS 가 안 풀린다(NXDOMAIN). 본진 조회는 오직 n8n 안에서만 된다.
>
> **역할 분담:** n8n 은 **데이터만 나른다.** 처리(in-scope 필터·confidence=low 제거·중복제거·스크럽)는
> 전부 **CaseLab `/api/sync/calls` 라우트**가 한다. 단 하나 **전화번호·상담원명 제거만 n8n(③)에서** 한다 —
> 그건 CaseLab 에 도착하는 순간 이미 PII 유출이라 옮길 수가 없다.
>
> **실행:** 크론 없이 **수동**. n8n 에서 "Execute Workflow" 버튼 한 번.

## 노드 구성 (4개)

```
① HTTP POST 본진 /query        → calls_phones.sql        → [ {phone}, {phone}, … ]  (번호당 한 행)
② HTTP GET  통화 API           → by-phone (행마다 자동 반복) → 각 응답에 results[]
③ Code      펼치기 + PII 제거 + 500개 배치                 → [ {rows:[…]}, … ]
④ HTTP POST CaseLab /api/sync/calls  (배치마다 자동 반복)   → 라우트가 필터·스크럽·upsert
```

n8n HTTP 노드는 **들어온 행마다 한 번씩** 자동 실행되므로, ②·④에 별도 루프 노드가 필요 없다.

---

### ① HTTP POST — 본진 조회

| 항목 | 값 |
|---|---|
| Method | `POST` |
| URL | `http://wishket-api-server:8001/query` |
| Body | 기존 projects 워크플로와 **같은 형식** ([`calls_phones.sql`](./calls_phones.sql) 붙여넣기) |

→ 결과: `{ "phone": "010-…" }` 행이 번호 개수만큼. (커서 없음 — 통화는 매번 전량 재조회, id upsert 라 무해)

---

### ② HTTP GET — 통화 API

| 항목 | 값 |
|---|---|
| Method | `GET` |
| URL | `http://192.168.10.217:8000/api/calls/by-phone/` |
| Query `phone` | 아래 정규화 표현식 |
| Query `limit` | `100` |

`phone` 파라미터 값 (명세 §5 정규화 — 하이픈 제거, +82/8210 → 0):

```
={{ (() => { let d = String($json.phone).replace(/[^0-9]/g,''); if (d.startsWith('8210')) d='0'+d.slice(2); else if (d.startsWith('82') && d.length>=11) d='0'+d.slice(2); return d; })() }}
```

> ⚠️ 한 번호에 통화가 100건을 넘으면 초과분은 못 가져온다(페이지네이션 생략, 단순화). 대부분 프로젝트는 그 아래다.
> 나중에 필요하면 `offset` 루프를 추가한다.

---

### ③ Code — 펼치기 + PII 제거 + 배치

Mode: **Run Once for All Items**. 통화 API 응답의 `results[]` 를 펼치고, **전화번호·상담원명·프로젝트명은 뺀다**
(CaseLab 이 필요로 하는 필드만 남긴다). 500개씩 묶어 `{rows:[…]}` 로 낸다.

```js
const all = [];
for (const item of $input.all()) {
  for (const c of (item.json.results || [])) {
    all.push({
      id: c.id,
      project_id: c.project_id,
      call_type: c.call_type,
      call_time_secs: c.call_time_secs,
      summary: c.summary,          // 스크럽은 CaseLab 이 한다
      transcript: c.transcript,    // 스크럽은 CaseLab 이 한다
      user_type: c.user_type,      // client | partner (응답에 이미 있음)
      confidence: c.confidence,    // low 제거는 CaseLab 이 한다
      drive_url: c.drive_url,
      created_at: c.created_at,
      // phone·member_name·project_title 은 의도적으로 제외 — PII 는 여기서 끊는다
    });
  }
}
const out = [];
for (let i = 0; i < all.length; i += 500) {   // CaseLab MAX_BATCH=500
  out.push({ json: { rows: all.slice(i, i + 500) } });
}
return out;
```

---

### ④ HTTP POST — CaseLab 적재

| 항목 | 값 |
|---|---|
| Method | `POST` |
| URL | `https://<caselab>/api/sync/calls` |
| Header | `X-CaseLab-Key: <CASELAB_SYNC_KEY>` |
| Body (JSON) | `={{ $json }}`  (= `{rows:[…]}`) |

라우트 응답: `{ "upserted": N, "skipped": M, "cursor": … }`.
- `upserted` — 저장된 통화 수
- `skipped` — in-scope 아니거나 `confidence=low` 라 걸러진 수 (많이 나오는 게 정상 — 전화번호로 조회하면 남의 프로젝트·저신뢰 통화가 섞여 온다)

---

## PII 가드레일 요약

| 항목 | 처리 | 위치 |
|---|---|---|
| 전화번호·상담원명 | POST row 에서 제외 | **n8n ③** (CaseLab 에 도달 안 함) |
| summary·transcript | `scrubPii`(전화/이메일/주민번호) | CaseLab 라우트 |
| confidence=low (오매핑) | 제거 | CaseLab 라우트 |
| 이름(원문 속) | 못 잡음 — 알려진 한계 | — |
