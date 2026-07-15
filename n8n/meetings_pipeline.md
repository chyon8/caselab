# 사전 미팅 녹취 동기화 (n8n 워크플로)

통화 녹취(by-phone, [`calls_pipeline.md`](./calls_pipeline.md))와 **별개 파이프라인**이다. 같은 통화 API 서버
(192.168.10.217)에서 오지만 **엔드포인트·데이터가 다르다**: by-phone 은 전화번호로 한쪽 통화를 주고,
`/api/meetings/` 는 **project_id 로 매칭해 3자(매니저·클라·파트너) 전문**을 준다.

> **왜 이게 더 단순한가:** by-phone 은 전화번호 hop·confidence 추측·남의 프로젝트 섞임을 CaseLab 이
> 필터로 막아야 했다. 미팅 API 는 project_id 로 바로 조회되므로 그 방어가 통째로 없다.
>
> **역할 분담:** n8n 은 데이터만 나른다. 딱 하나 **member_name(우리 매니저명) 제거만 n8n(⑤)에서** 한다 —
> CaseLab 에 도착하는 순간 이미 PII 라 옮길 수 없다. summary·transcript 스크럽(전화/이메일/주민번호)은
> CaseLab `/api/sync/meetings` 라우트가 한다.
>
> **실행:** 크론 없이 **수동**. "Execute Workflow" 한 번. (백필·정기 실행 모두 같은 롤링 윈도우.)

## 노드 구성 (6개)

```
① HTTP POST 본진 /query          → meeting_project_ids.sql   → [ {project_id}, … ]   (프로젝트당 한 행)
② HTTP GET  미팅 API (목록)       → ?project_id= (행마다 반복) → 각 응답에 results[] (전문 제외)
③ Code      results 펼치기        → 미팅 id 만 추림           → [ {id}, {id}, … ]
④ HTTP GET  미팅 API (단건)       → ?id= (행마다 반복)        → 각 응답에 transcript 포함
⑤ Code      member_name 제거 + 배치                          → [ {rows:[…]}, … ]
⑥ HTTP POST CaseLab /api/sync/meetings (배치마다 반복)        → 라우트가 스크럽·upsert
```

n8n HTTP 노드는 **들어온 행마다 한 번씩** 자동 실행되므로 ②·④·⑥에 별도 루프 노드가 필요 없다.

---

### ① HTTP POST — 본진 조회 (in-scope project_id)

| 항목 | 값 |
|---|---|
| Method | `POST` |
| URL | `http://wishket-api-server:8001/query` |
| Body | projects 워크플로와 **같은 형식** ([`meeting_project_ids.sql`](./meeting_project_ids.sql) 붙여넣기) |

→ 결과: `{ "project_id": 155820 }` 행이 프로젝트 수만큼. (커서 없음 — 미팅은 매번 전량 재조회, id upsert 라 무해)

---

### ② HTTP GET — 미팅 목록

| 항목 | 값 |
|---|---|
| Method | `GET` |
| URL | `http://192.168.10.217:8000/api/meetings/` |
| Query `project_id` | `={{ $json.project_id }}` |

→ 응답: `{ project_id, total, results:[ {id, title, partner_slug, …} ] }` (전문 제외). 미팅 없으면 `total:0`.

---

### ③ Code — 미팅 id 펼치기

Mode: **Run Once for All Items**. 각 프로젝트 응답의 `results[]` 를 펼쳐 **미팅 id 만** 다음 노드로 넘긴다.

```js
const out = [];
for (const item of $input.all()) {
  for (const mt of (item.json.results || [])) {
    out.push({ json: { id: mt.id } });
  }
}
return out;
```

---

### ④ HTTP GET — 미팅 단건 (전문 포함)

| 항목 | 값 |
|---|---|
| Method | `GET` |
| URL | `http://192.168.10.217:8000/api/meetings/` |
| Query `id` | `={{ $json.id }}` |

→ 응답: `{ id, project_id, partner_slug, summary, transcript, created_at, member_name, … }`.
`transcript` 는 `## 요약 … ## 전문\n[00:01] 파트너: …` 형식 통짜 문자열.

---

### ⑤ Code — member_name 제거 + 배치

Mode: **Run Once for All Items**. CaseLab 이 저장하는 필드만 남긴다 — **member_name(매니저명)은 뺀다.**
500개씩 묶어 `{rows:[…]}` 로 낸다.

```js
const all = [];
for (const item of $input.all()) {
  const m = item.json;
  all.push({
    id: m.id,
    project_id: m.project_id,
    partner_slug: m.partner_slug,   // 슬러그만 — 개발사 구분용
    summary: m.summary,             // 스크럽은 CaseLab 이 한다
    transcript: m.transcript,       // 스크럽은 CaseLab 이 한다
    created_at: m.created_at,
    // member_name(매니저명)·duration_secs·project_title 은 의도적으로 제외 — PII·불필요
  });
}
const out = [];
for (let i = 0; i < all.length; i += 500) {   // CaseLab MAX_BATCH=500
  out.push({ json: { rows: all.slice(i, i + 500) } });
}
return out;
```

---

### ⑥ HTTP POST — CaseLab 적재

| 항목 | 값 |
|---|---|
| Method | `POST` |
| URL | `https://<caselab>/api/sync/meetings` |
| Header | `X-CaseLab-Key: <CASELAB_SYNC_KEY>` |
| Body (JSON) | `={{ $json }}`  (= `{rows:[…]}`) |

라우트 응답: `{ "upserted": N, "skipped": M, "cursor": … }`.
- `upserted` — 저장된 미팅 수
- `skipped` — 아직 CaseLab 에 없는 프로젝트의 미팅 (projects 워크플로가 먼저 돌면 다음 주기에 적재됨)

---

## PII 가드레일 요약

| 항목 | 처리 | 위치 |
|---|---|---|
| member_name(매니저명) | POST row 에서 제외 | **n8n ⑤** (CaseLab 에 도달 안 함) |
| summary·transcript | `scrubPii`(전화/이메일/주민번호) | CaseLab 라우트 |
| 이름(전문 속) | 못 잡음 — 알려진 한계 | — |
