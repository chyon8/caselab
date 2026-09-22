# 제출 원문 블라인드 검증 가이드

## 입력과 원칙

- 입력 파일은 `.private/submission-conversion/`의 `calibration-reviewer-a.tsv`, `calibration-reviewer-b.tsv`, `validation-reviewer-a.tsv`, `validation-reviewer-b.tsv`다.
- 두 검토자는 서로의 답과 모집·거절·취소·계약 결과를 보지 않고 독립적으로 작성한다.
- 원문에 직접 적힌 내용만 분류한다. 미언급은 부정이 아니라 `none` 또는 `unknown`이다.
- 플랫폼 질문·도움말·예시 문구는 고객의 답으로 보지 않는다.

## 허용값

| 열 | 허용값 | 기준 |
|---|---|---|
| `purpose_context` | `none`, `purpose_only`, `purpose_and_context` | 목적만 있으면 `purpose_only`, 실제 사용자·사용 상황까지 있으면 `purpose_and_context` |
| `function_specificity` | `none`, `list`, `behavior` | 기능명 나열은 `list`, 입력·처리·결과·조건·예외가 있으면 `behavior` |
| `scope_definition` | `none`, `deliverable_or_boundary`, `both` | 산출물 또는 포함·제외 경계 하나면 중간값, 둘 다면 `both` |
| `project_mode` | `new_build`, `enhancement`, `maintenance`, `integration_migration`, `consulting`, `unknown` | 가장 직접적인 하나만 선택 |
| `existing_system_or_integration` | `true`, `false` | 기존 시스템·외부 API·데이터 이전/연동이 명시된 경우만 `true` |
| `preparation_artifacts` | 쉼표 구분 | `requirements`, `screen_design`, `reference`, `existing_data`, `api_spec`, `other`; 실제 보유·첨부·제공 근거가 있을 때만 |

기능 목록과 외부 연동은 그 자체로 과업 경계가 아니다. 본문에 요구사항이 적혀 있다는 이유만으로 `requirements` 문서를 보유했다고 분류하지 않는다.

## 순서와 통과

1. 교정 40건을 독립 판독하고 불일치 원인을 논의해 규칙을 수정한다.
2. 규칙을 동결한 뒤 검증 80건을 새로 독립 판독한다.
3. `node scripts/evaluate-submission-text.mjs validation`으로 일치도와 AI 성능을 계산한다.
4. 사람 간 일치율 85%·κ 0.70 이상인 항목만 전수 분류 후보로 사용한다. 양성 10건 미만은 탐색용이다.
