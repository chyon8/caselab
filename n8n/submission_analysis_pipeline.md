# 제출→모집 분석 일회성 백필

운영 `projects` 동기화와 분리한 수동 워크플로다. 2026년 1~8월 외주 전체 제출을
`submission_analysis_projects`에 저장한다. 고객 식별자·연락처·담당자명·회사명은 전송하지 않는다.

## 사전 조건

1. Neon에 `migrations/021_submission_analysis.sql` 적용
2. 이 코드 배포 후 `/api/sync/submission-analysis` 사용 가능

## 노드

```text
Manual Trigger → 분석 커서 → 분석 원천 조회 → 분석 적재 → IF
                    ▲                              │
                    └──────── 200건이면 반복 ──────┘
```

### 분석 커서

- 기존 `cursor` GET 노드를 복제
- 이름: `분석 커서`
- URL: `https://caselab-three.vercel.app/api/sync/cursor?source=submission_analysis_2026_01_08_v2`
- 기존 `X-CaseLab-Key` 유지

### 분석 원천 조회

- 기존 본진 `/query` 노드를 복제
- SQL: `submission_analysis_backfill.sql` 전체
- 결과는 item 1개의 `data` 배열

### 분석 적재

- 기존 CaseLab 적재 노드를 복제
- Method: `POST`
- URL: `https://caselab-three.vercel.app/api/sync/submission-analysis`
- 기존 `X-CaseLab-Key` 유지
- JSON body expression: `{{ { rows: $json.data } }}`

응답 `received`, `upserted`, `skipped`, `cursor`를 확인한다. 정상 배치는 200/200/0이다.

### IF 반복

- 조건: `{{ $json.received }}` equals `200`
- true는 `분석 커서`로 연결
- false면 종료
- 최대 25회만 허용한다. 예상 4,319건이므로 22회이며 마지막 응답은 119건이어야 한다.

## 완료 확인

- 각 배치 `skipped=0`
- 합계 `received=4,319`, 고유 프로젝트 4,319
- 모집일 있음 1,932
- 마지막 응답 119건, `done=true`
- 원천 조회/적재 노드의 성공 출력에 `client_id`, 이름, 전화번호, 이메일이 없어야 함
