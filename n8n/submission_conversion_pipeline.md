# 제출→모집 전환 매일 적재

`/report/conversion`(사이드바 "제출 전환", sangmin 전용)이 읽는 `submission_analysis_projects`를 매일 갱신한다.
2026-01~08 1회성 백필([submission_analysis_pipeline.md](./submission_analysis_pipeline.md))과 같은 테이블·같은 적재 API를 쓴다.

- 매 실행마다 **최근 60일 제출 외주를 처음부터 다시** 읽는다. 새 제출 추가와 기존 건 상태 갱신이 이것 하나로 된다.
- 커서를 저장하지 않는다. `/api/sync/cursor`를 쓰지 않고, 적재 응답의 `last_id`로 다음 페이지를 넘긴다.
- 60일이면 하루 약 1,100건, 5~6회 반복이다.

## 사전 조건

- Neon에 [`migrations/024`](../migrations/024_submission_analysis_manager.sql) 적용(2026-09-30 적용 완료)
- 이 코드(적재 API가 `inspection_manager`를 받고 `last_id`를 돌려주는 버전)가 Vercel에 배포돼 있어야 한다.

## 노드

```text
Schedule(매일 1회) → 시작 커서 → 원천 조회 → 적재 → IF 반복
                                   ▲                    │ true
                                   └──── 다음 커서 ◀────┘
```

### 시작 커서 (Edit Fields / Set)

- 필드 하나: `id` (Number) = `0`

### 원천 조회

- 기존 백필 워크플로의 `분석 원천 조회` 노드를 복제한다(본진 `/query` 호출)
- SQL: [`submission_conversion_daily.sql`](./submission_conversion_daily.sql) 전체
- 본진 `/query`는 쿼리가 `SELECT`로 시작하지 않으면 `Only SELECT queries are allowed`로 거부한다. 그래서 이 SQL 파일에는 주석을 넣지 않는다(설명은 이 문서에 둔다)
- SELECT 절은 백필 SQL에 `inspection_manager`(담당 검수 매니저, projects_incremental.sql과 같은 규칙)를 더한 것이다. 200건 제한은 초기 원문 때문에 Vercel 요청 크기를 넘지 않게 하려는 것이다
- SQL 안의 `{{ $json.id }}`는 들어오는 item(시작 커서 또는 다음 커서)의 `id`다

### 적재

- 기존 백필 워크플로의 `분석 적재` 노드를 복제한다
- Method `POST`, URL `https://caselab-three.vercel.app/api/sync/submission-analysis`
- 기존 `X-CaseLab-Key` 헤더 유지
- JSON body expression: `{{ { rows: $json.data } }}`

### IF 반복

- 조건: `{{ $json.received }}` equals `200`
- true → `다음 커서`, false → 종료
- 무한 반복 방지를 위해 30회를 넘기지 않게 한다(정상 5~6회)

### 다음 커서 (Edit Fields / Set)

- 필드 하나: `id` (Number) = `{{ $json.last_id }}`
- 출력을 `원천 조회`로 연결한다

## 첫 실행 (수동)

- **첫 실행만 SQL의 `INTERVAL 60 DAY`를 `INTERVAL 400 DAY`로 바꿔** 2026-01부터 전부 다시 받는다(약 5,000건, 25회 정도 반복). 1~8월 백필분에는 담당 매니저가 없어서 이렇게 채워야 한다. 9월 제출분도 이때 처음 들어온다. 첫 실행 뒤 `60`으로 되돌린다.
- 이 실행만 IF 반복 제한을 40회로 둔다.
- 배치마다 `skipped = 0`인지 확인한다. 0이 아니면 `last_id`가 빠질 수 있으니 멈추고 확인한다.
- 마지막 응답은 `received < 200`, `done = true`여야 한다.

## 완료 확인

- 원천 조회 출력에 `client_id`, 고객 이름·전화번호·이메일이 없어야 한다(검수 매니저명 `inspection_manager`만 예외)
- 다음 날 Schedule 실행 기록이 성공이어야 한다
- CaseLab 월별 건수 대조: 본진 월별 외주 제출 수와 비교한다
