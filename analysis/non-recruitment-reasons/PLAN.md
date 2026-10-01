# 제출 후 미모집 사유 분석 — 실행 계획

> 작성 2026-10-01. **새 세션은 이 문서부터 시작한다.** 아직 개발은 시작하지 않았다. 사용자가 지시하면 §5의 1단계부터 시작한다.
> 먼저 읽을 것: [NEXT_STEPS.md «제출→모집 전환률 상시 집계»](../../NEXT_STEPS.md#제출모집-전환률-상시-집계--가동-2026-09-30)(같은 테이블과 파이프라인을 쓴다), [DATA_SCHEMA.md «검수 거절 사유» 절](../../DATA_SCHEMA.md).

---

## 1. 목표

**제출했지만 모집으로 넘어가지 못한 외주가 왜 그렇게 끝났는지 알아내서, 거절률·연락안됨 비율·모집 전 취소를 줄인다.**

- 어떤 프로젝트(업종·서비스·기획 상태·예산·첨부)와 어떤 고객(사업 형태·가입 경로·이전 이력)이 어떤 사유로 떨어지는지 본다.
- 결과는 **CaseLab 안의 보고서 화면**으로 바로 본다. 매일 적재되는 데이터로 자동 갱신한다.
- **중심은 유효 거절이다.** 무효 거절과 모집 전 직접 취소는 따로 묶어서 보여 준다.

**모집 후 취소는 대상이 아니다.** `cannot_contact` 같은 모집 후 취소 사유는 쓰지 않는다.

## 2. 확정된 결정 (사용자, 2026-10-01)

| 항목 | 결정 |
|---|---|
| 대상 | 제출 후 **모집 전환 없이** 거절되거나 취소된 외주 |
| 기간 | **2026-01-01 KST 제출분부터.** 기존 `submission_analysis_projects` 범위와 같다. 2024-11까지 늘리는 건 업종 × 사유 칸이 너무 얇을 때 따로 검토한다 |
| 중심 | **유효 거절** |
| 무효 처리 | 전환율 보고서(`/report/conversion`)에서는 지금처럼 무효를 뺀다. **이 보고서에서는 무효 거절과 모집 전 직접 취소도 포함하되, 별도 묶음으로 보여 준다** |
| 사유 분류 | 거절 메모 **첫 줄의 정해진 문구**가 대표 사유다. 자유 서술은 그 뒤에 부가 설명으로 붙는다(사용자 확인). **규칙(문구 매칭)으로만 분류하고 LLM은 쓰지 않는다** |
| 부가 설명 | 나중에 «왜»를 깊게 볼 때 다룬다. 이번 범위에서는 제외 |

## 3. 데이터

### 이미 있는 것

`submission_analysis_projects`(Neon)에 2026-01 이후 제출된 외주가 **거절·취소·대기 건까지 전부** 있다(2026-09-30 기준 4,770건). n8n이 매일 최근 60일 제출분을 다시 읽어 갱신한다.

| 쓰임 | 컬럼 |
|---|---|
| 결과 | `recruited_at`, `is_rejected`, `rejected_at`, `is_cancelled`, `cancelled_at`, `raw_cancel_type`, `reject_invalid`, `inspection_manager` |
| 업종·서비스 | `categories`, `representative_field`, `project_purpose` |
| 프로젝트 | `plan_status`, `initial_budget`, `initial_term_days`, `budget_option`, `is_supporting_project`, `inside_manpower`, `user_file_count_at_submit` |
| 고객 | `business_form`, `acquisition_path`(고객 계정의 가입 경로이지 이번 제출의 유입 경로가 아님), `prior_platform_submissions`, `prior_platform_recruitments`, `is_first_client_project_in_cohort` |

`plan_status`·`is_supporting_project`·`inside_manpower`·`budget_option`은 제출 당시 값인지 불확실하거나 비어 있는 경우가 많아서 전환율 화면에서 뺐다. 여기서 쓸 때도 그 한계를 화면에 표시한다.

### 없는 것: 거절 사유 문구

- 출처는 본진 `process_log_inspectionlog.note`다. 프로젝트별 `status='reject'` 로그 중 **id가 가장 큰 행**의 메모를 쓴다. 사내 Tableau «부적합 사유»와 같은 규칙이다.
- 지금 일일 쿼리는 이 메모를 읽어 `reject_invalid`만 판정하고, 문구는 싣지 않는다.
- **메모 둘째 줄부터는 고객 메일 원문·이메일·실명이 섞인다. 첫 줄만 가져온다.**
- `is_rejected`인데 거절 로그가 없는 건도 있다(7~8월 55건). 이 건들은 사유 «미지정»으로 둔다.

### 모집 전 직접 취소 사유

`raw_cancel_type`의 고정 코드를 쓴다(`add_mistake`, `project_cancel`, `change_plan`, `duplicate`, `by_inhouse`). LLM은 필요 없다. 검수 거절 건에는 이 값이 비어 있다.

## 4. 대상 묶음과 지표

대상은 `submitted_at >= 2026-01-01 KST AND recruited_at IS NULL`이다.

| 묶음 | 조건 | 사유 출처 |
|---|---|---|
| **유효 거절** (중심) | `is_rejected AND reject_invalid IS NOT TRUE` | 거절 메모 첫 줄 |
| 무효 거절 | `is_rejected AND reject_invalid IS TRUE` | 거절 메모 첫 줄 |
| 모집 전 직접 취소 | `is_cancelled AND NOT is_rejected` | `raw_cancel_type` |
| 결과 대기 | 위 셋이 아님 | 사유 없음. 비율의 분모에만 들어간다 |

- 검수 매니저가 없는 «미배정»은 거의 전부 모집 전 직접 취소다. 직접 취소 묶음 안에서 따로 표시한다.
- 지표
  - **유효 거절률** = 유효 거절 ÷ 유효 제출. 분모는 전환율 화면과 같다(`getSubmissionConversionStats`의 무효 정의)
  - **연락안됨 비율** = 사유 카테고리가 «연락 안됨»인 유효 거절 ÷ 유효 제출
  - **모집 전 직접 취소** = 건수, 전체 제출 대비 비율. 이 묶음은 유효 제출 분모에서 빠지므로 분모를 **전체 제출**로 둔다
- 세그먼트별 비율에는 건수와 95% 신뢰구간을 함께 표시한다. 20건 미만인 칸은 «표본 적음»으로 흐리게 표시한다. 전환율 화면과 같은 규칙이다.

## 5. 실행 단계

### 1단계 — 사유 첫 줄 수집

1. `migrations/026_submission_analysis_reject_reason.sql`: `ALTER TABLE submission_analysis_projects ADD COLUMN IF NOT EXISTS reject_reason TEXT;`
2. [n8n/submission_conversion_daily.sql](../../n8n/submission_conversion_daily.sql): `reject_invalid`와 같은 서브쿼리 구조로 `reject_reason`을 추가한다.
   - 값: 최신 거절 메모의 첫 줄. `\r`을 제거하고 `SUBSTRING_INDEX(note, '\n', 1)`을 TRIM한 뒤 `LEFT(…, 100)`
   - **SQL 파일에 주석을 넣지 않는다.** 주석이 있으면 본진 `/query`가 `Only SELECT queries are allowed`로 거부한다.
3. 적재 API [route.ts](../../src/app/api/sync/submission-analysis/route.ts)와 매핑에 `reject_reason`을 추가한다.
4. 1~7월분 다시 채우기: n8n SQL의 `INTERVAL 60 DAY`를 **`400 DAY`로 잠깐 바꿔** 한 번 돌리고 되돌린다. 절차는 [submission_conversion_pipeline.md «첫 실행»](../../n8n/submission_conversion_pipeline.md)에 있다. 배치는 `LIMIT 200`을 넘기지 않는다.
- **확인**
  - 유효 거절 중 `reject_reason`이 채워진 비율. 로그 없는 건만 비어 있어야 한다.
  - 7~8월 원장(`.private/submission-conversion/`)의 사유와 표본 대조.
  - 저장된 첫 줄에 이메일·전화번호 패턴이 없는지 SQL로 검사. 있으면 해당 패턴을 SQL에서 지운다.

### 2단계 — 빈도표와 카테고리 확정

1. Neon에서 `reject_reason` 빈도표를 뽑는다. 끝의 숫자(«연락 안됨 7»의 7)와 공백 차이는 정규화한 뒤 센다.
2. 위에서부터 10~15개 카테고리로 묶는 초안을 만든다. 연락 안됨·타 업체 선정처럼 겹치는 항목은 기존 취소 태그 11종([cancel-tags.ts](../../src/lib/cancel-tags.ts))과 이름을 맞춘다.
3. 정해진 문구 없이 서술로 시작하는 줄이 몇 건인지 센다. 소수면 «기타»로 둔다.
- **확인:** 사용자가 카테고리 목록을 확정한다. 사내 Tableau «부적합 사유» 카테고리 목록을 받으면 그것을 우선 따른다.

### 3단계 — 분류 규칙

- 문구 → 카테고리 사전을 TS 상수로 둔다(예: `src/features/report/reject-reason-categories.ts`).
- **DB에는 원래 첫 줄만 저장하고, 분류는 조회할 때 한다.** 그래야 사전을 고쳐도 다시 적재할 필요가 없다.
- 매칭은 정규화한 첫 줄의 **앞부분 일치**로 한다. `reject_invalid` 판정과 같은 방식이다.
- 어디에도 안 맞으면 «기타», 로그가 없으면 «미지정».
- **확인:** 규칙으로 잡힌 비율(목표 90% 이상)을 확인하고, «기타» 상위 문구를 사전에 추가할지 사용자에게 보여 준다.

### 4단계 — 보고서 화면

- 위치: `/report/conversion`과 같은 권한(`REPORT_CONVERSION_EMAILS`, sangmin만)의 **별도 페이지**를 추천한다. 예: `/report/non-recruitment`, 사이드바 «미모집 사유». 새 세션에서 사용자에게 확인한다.
- 구성
  1. 요약: 유효 제출, 유효 거절률, 연락안됨 비율, 모집 전 직접 취소 건수. 기간 탭은 제출일 기준이고 전환율 화면의 `period.ts`를 재사용한다.
  2. 유효 거절 사유 분포(카테고리별 건수·비율), 월별 추이
  3. 세그먼트 × 사유: 대표 분야, 사업 형태, 가입 경로, 첫 제출/재이용 고객, 첨부 유무, 예산 구간, 검수 매니저
  4. 별도 묶음: 무효 거절 사유 분포, 모집 전 직접 취소 `cancel_type` 분포(미배정 표시)
- 조회 함수는 [postgres.ts](../../src/data/postgres.ts)의 `getSubmissionConversionStats` 옆에 둔다. `DataSource` 인터페이스에도 추가한다.
- 스타일은 [design.md](../../design.md) 토큰과 CSS Modules를 쓴다. 기존 [SubmissionConversionReport.tsx](../../src/features/report/SubmissionConversionReport.tsx)의 표·흐림 규칙을 따른다.
- **확인:** 화면의 카테고리 합계가 Neon 직접 집계와 일치하는지, 유효 제출 분모가 전환율 화면과 같은지 본다.

### 5단계 — 개선 포인트 정리 (보고서 이후)

- 카테고리를 «막을 수 있음»(등록 폼·사전 안내·매니저 응대로 줄일 수 있는 것)과 «막을 수 없음»(사업 취소·고객 결정)으로 나눈다.
- 막을 수 있는 사유가 몰리는 세그먼트를 찾는다. 결과는 NEXT_STEPS.md에 기록한다.

## 6. 사용자가 할 일

- [ ] (선택) 사내 Tableau «부적합 사유» 카테고리 목록 전달
- [ ] 1단계: 바뀐 SQL을 n8n 노드에 반영. Neon에 migration 026 적용(이전 세션에서 누가 적용했는지 확인)
- [ ] 1단계: 400일 창으로 1회 실행한 뒤 60일로 되돌리기
- [ ] 2단계: 카테고리 목록 확정
- [ ] 4단계: 보고서 화면 위치·이름 확정, 검토
- [ ] 각 단계 커밋·배포. AI는 git 명령을 직접 실행하지 않는다(CLAUDE.md §6)

## 7. 나중에 할 것 (이번 범위 밖)

- 메모의 부가 설명(둘째 줄부터)을 이용한 세부 원인 분석. 개인정보 때문에 CaseLab으로 원문을 가져오지 않는다. 필요하면 본진 쪽에서 비식별·요약한 결과만 받는 방식을 따로 설계한다.
- 매일 들어오는 신규 거절 중 사전에 없는 문구가 늘어나면, 사전을 갱신할지 LLM 보조 분류를 붙일지(기존 OpenAI 키·gpt-4o-mini·하루 3회 자동 갱신 구조) 판단한다.
- 기간을 2024-11까지 확장하는 것. 제출 파이프라인 범위를 바꿔야 해서 전환율 보고서에도 영향이 있다.
