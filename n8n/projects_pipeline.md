# projects 동기화 워크플로

> 2026-09-16 실제 n8n 캔버스와 운영 설정 기준.

## 현재 구조

수동 `Webhook`과 각 Schedule Trigger가 같은 파이프라인을 실행한다.

```text
Webhook ─────────────────────┐
프로젝트 내역 가져오기 ──────┴→ cursor
                                ↓
                              HTTP Request
                                ↓
                              HTTP Request1
                                ↓
                              지원자수 가져오기
                                ↓
                              지원자수 업데이트
```

| 노드 | 역할 | 설정 |
|---|---|---|
| `프로젝트 내역 가져오기` | 자동 실행 Schedule Trigger | 운영 주기 |
| `cursor` | projects 증분 커서 조회 | `GET https://caselab-three.vercel.app/api/sync/cursor?source=projects` |
| `HTTP Request` | 본진 프로젝트 증분 조회 | `POST http://wishket-api-server:8001/query`, SQL은 [`projects_incremental.sql`](./projects_incremental.sql) |
| `HTTP Request1` | 일반 프로젝트 적재 | `POST https://caselab-three.vercel.app/api/sync/projects` |
| `지원자수 가져오기` | 모집 중 프로젝트의 현재 지원수 전량 조회 | `POST http://wishket-api-server:8001/query`, SQL은 [`proposal_counts_refresh.sql`](./proposal_counts_refresh.sql) |
| `지원자수 업데이트` | 지원수만 갱신 | `POST https://caselab-three.vercel.app/api/sync/proposal-counts` |

## 지원자수 별도 갱신이 필요한 이유

본진은 지원자가 늘어도 `project_project.date_modified`를 갱신하지 않는다. 따라서
`date_modified` 커서 기반인 일반 프로젝트 조회 결과에는 지원수만 바뀐 프로젝트가 들어오지 않는다.
일반 프로젝트 적재가 끝난 뒤 모집 중 프로젝트의 `id`, `proposal_count`를 전량 다시 읽어야 한다.

## `지원자수 가져오기`

기존 `HTTP Request` 노드를 복제해 인증과 본진 `/query` Body 형식을 유지하고, SQL만
[`proposal_counts_refresh.sql`](./proposal_counts_refresh.sql)로 교체한다. 이 쿼리에는 cursor 조건을
넣지 않는다.

본진 `/query` 응답은 여러 n8n item이 아니라 아래 모양의 **item 1개**다. 실제 조회 행은
`data` 배열에 들어 있다.

```json
{
  "success": true,
  "data": [
    { "id": 158501, "proposal_count": 35 },
    { "id": 158502, "proposal_count": 12 }
  ]
}
```

## `지원자수 업데이트`

기존 `HTTP Request1`을 복제해 `X-CaseLab-Key` 등 인증 설정을 유지한다.

- Method: `POST`
- URL: `https://caselab-three.vercel.app/api/sync/proposal-counts`
- Body Content Type: `JSON`
- Body: Expression 모드에서 아래 식 사용

```js
{{ { rows: $json.data } }}
```

입력이 원래 item 하나이므로 Aggregate, Code, `Execute Once`, 다른 노드 참조는 전부 필요 없다.

정상 응답 예시:

```json
{
  "received": 286,
  "updated": 41
}
```

- `received`: 본진에서 조회해 전송한 전체 프로젝트 수. `1`이면 item 병합이 안 된 것.
- `updated`: CaseLab의 기존 값과 달라 실제 UPDATE된 프로젝트 수. 이미 최신이면 `0`이어도 정상.

## 검증 절차

1. `지원자수 가져오기`를 실행하고 여러 item이 출력되는지 확인한다.
   n8n item은 1개이고 그 안의 `data` 배열 길이가 실제 조회 건수다.
2. `지원자수 업데이트`를 실행하고 `received`가 `data` 배열 길이와 같은지 확인한다.
3. CaseLab 홈에서 `지금 동기화`를 눌러 두 노드가 모두 성공하는지 확인한다.
4. 모집 중 프로젝트 상세의 `지원 N건`이 본진 값과 같은지 확인한다.

## 주의

- 지원수 업데이트는 `projects` 커서를 변경하지 않는다.
- `proposal_counts`라는 별도 `sync_state` 행에는 완료 시각만 기록하고 cursor는 `NULL`이다.
- 지원수 갱신은 `content_hash`와 embedding을 건드리지 않는다.
- 지원수 전용 배치 상한은 10,000건이다. 응답의 `data`가 정확히 10,000건이면 페이지네이션이 필요하다.
