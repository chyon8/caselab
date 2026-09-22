# 제출→모집 분석 변수 정의서 v0.1

작성 기준일: 2026-09-22. 이 문서는 **분류 규칙 초안**이다. 결과를 가린 교정 표본으로 문구를 확정한 뒤 `codebook_version=1.0`으로 동결한다. 실제 값 분포·수집 시점·예측력을 검증했다는 뜻이 아니다.

## 1. 무엇을 측정하는가

이번 분석에서 “준비도”라는 단일 점수를 만들지 않는다. 다음 세 축을 독립 변수로 측정한다.

1. **기록된 요구사항의 구체성**: 제출 원문에서 목적, 기능·동작, 범위 등을 얼마나 확인할 수 있는가. 고객의 실제 준비 상태와 동일하지 않다.
2. **기록된 추진 여건**: 예산 확보, 착수·완료 일정, 내부 인력, 승인 구조, 보유 자산 등 실제 실행 조건에 관한 증거가 있는가.
3. **프로젝트 내용**: 무엇을, 왜, 어떤 제약 아래 만들려는가. 구체성이 높고 낮은 것과 별개다.

첨부 유무·글자 수·회사 규모는 이 축의 대체 점수가 아니다. 긴 양식은 구체적이지 않을 수 있고, 짧게 쓴 재이용 고객도 예산·권한·기존 자산을 갖췄을 수 있다. **“관측되지 않음”을 “준비되지 않음”으로 바꾸지 않는다.**

기존 [SCORING_SPEC.md](../../SCORING_SPEC.md)의 Completion은 상담 후 공고 작성에 필요한 정보의 충족도다. 해당 가중치·0~100 confidence·등록 가능 등급을 이 연구에 가져오지 않는다. [HANDOFF.md](../../HANDOFF.md)에도 기존 게이트의 미검증 상태가 명시되어 있다.

### 시간 축

| 구분 | 허용 근거 | 사용 목적 |
|---|---|---|
| T0 | 해당 제출 시점까지 기록되어 있던 원본·시점 복원 자료 | 제출 당시 고객·프로젝트 특성과 전환의 주 비교 |
| T1 | 제출 이후, 최초 모집·검수 거절·고객 취소 중 첫 결과 이전 기록 | 상담 중 드러난 여건, 추가 확인 질문, 운영 가설의 별도 탐색 |
| T2 | 최초 결과 시점 및 이후 기록 | 결과·거절 사유 해석, 이후 계약 관찰. T0 특성 보완에 사용 금지 |
| 시점 미확인 | 현재 값만 있거나 필드 변경 이력을 복원 못 함 | 데이터 현황표만. T0/T1 비교에서 제외 |

나중에 “제출 때부터 개발자가 있었다”고 회고한 진술도 T0 주분석 값으로 소급하지 않는다. 별도 `reported_valid_at`에 과거 대상 시점을 적고 `known_at`은 실제 기록 시각으로 유지한다. T1은 검수 기간·접촉량이 길수록 내용이 많이 쌓이는 선택편향이 있어 T0와 합치지 않는다.

## 2. 공통 저장 형식과 결측 의미

분류 결과는 `feature_observations`라는 분석용 긴 형식 파일로 저장한다. 운영 DB/API 스키마를 바꿀 필요는 없다. 같은 프로젝트의 각 변수·시간 축마다 한 행이며, 복수 근거는 `evidence` 배열에 보존한다.

| 필드 | 규칙 |
|---|---|
| `project_id`, `submission_episode_id` | 분석 원장과 동일 키. 반복 제출을 복원 못 하면 에피소드 ID를 임의 생성하지 않고 원장의 처리 규칙 따름 |
| `feature_id`, `value`, `raw_value` | 아래 변수 ID, 정규화 값, 변환 전 값. 다중 라벨은 배열 |
| `observation_window` | `T0`, `T1`, `T2`, `time_unverified` |
| `value_status` | 아래 결측/증거 상태. null·false·빈 배열을 동일 처리하지 않음 |
| `measured_at` | 이번 추출·분류 실행 시각 |
| `known_at` | 정보가 최초로 기록된 검증 가능한 시각. 현재 export 시각으로 대체 금지 |
| `reported_valid_at` | 내용이 가리키는 당시 시점. 알 수 없으면 null |
| `evidence` | `source_system`, `table_or_file`, `record_id`, `source_field`, `source_excerpt`, `source_recorded_at`, `source_version_or_hash` |
| `codebook_version`, `method` | 동결 버전, `structured`/`rule`/`human`/`ai_assisted` |
| `annotator_id`, `reviewer_id`, `review_status` | `unreviewed`, `double_coded`, `adjudicated`, `excluded`. 분석자는 별도 가명 사용 가능 |
| `conflict_note` | 상충한 값·시점·해결 근거. 해결 전 값을 임의 선택하지 않음 |

원문 인용은 판정 근거가 되는 최소 문장만 보존한다. 사람 이름·연락처는 근거에 필요하지 않으므로 분석용 파일에서 제거한다. 원본 접근이 제한되어도 출처 ID·시각은 남긴다.

| `value_status` | 뜻 | 예 |
|---|---|---|
| `observed` | 값 또는 상태가 명시·검증됨 | “이사회 승인 완료”, 확인된 파일 2개 |
| `explicit_none` | 없다는 직접 진술 또는 완전한 원장에서 0건이 확인됨 | “내부 개발자는 없습니다”, 제출 당시 첨부 0개 |
| `not_answered` | 질문/입력란이 당시 제공되었음을 확인했지만 미응답 | 당시 기업 규모 문항 공란 |
| `not_recorded` | 확인 가능한 자료는 있으나 그 사실 언급이 없음 | 제출문에 승인 구조 미언급 |
| `not_collected` | 해당 시기/입력 경로에서 항목 자체를 받지 않음 | 기업 규모 문항 도입 전 제출 |
| `unavailable` | 원자료가 미적재·누락되었거나 접근·복원·판독 불가 | 초기 스냅샷 행 없음, 삭제된 S3 파일, 비공개 기획서, 깨진 PDF |
| `time_unverified` | 값은 있으나 제출/검수 시점의 값인지 입증 못 함 | 수정 이력 없는 현재 `inside_manpower` |
| `conflict` | 같은 시점의 근거가 상충하고 해결되지 않음 | “예산 확정” 선택과 본문 “지원금 심사 중” |
| `not_applicable` | 명시한 적용 범위 밖 | 정부지원사업이 아닌 건의 지원금 선정 상태 |

`explicit_none`은 “없음” 응답이지 자료 부족이 아니다. `not_collected`와 `not_answered`를 구별할 근거가 없으면 `not_recorded`로 두고 혼동 가능성을 적는다. 세부 상태를 추측해서 채우지 않는다. `time_unverified`인 값도 raw에 보존하되 T0 통계에서 제외한다.

### 출처 우선순위와 검증

- T0 스냅샷에 대한 무결성·필드별 생성 의미를 확인한 뒤 사용한다. `project_projectinitialvalue`는 문서상 등록 원본이지만 `date_modified`도 있어 이름만으로 불변이라고 가정할 수 없다.
- `detail_projectdetail`은 문서상 생성·수정 시각이 없다. 현재 값만 조회했다면 T0가 아니다. 감사 이력·폼 로그·당시 export로 증명될 때 승격한다.
- 현재 공고문, CaseLab `posting_raw`, 통합 매니저 노트 AI 요약, 모집 후 Q&A를 등록 원문으로 대체하지 않는다. 현재 n8n SQL은 `initial_budget`, `initial_term`만 가져오고 `initialvalue.description`은 가져오지 않는다.
- 초기 스냅샷을 확보하지 못한 프로젝트는 `unavailable`이다. **“고객이 아무 내용도 쓰지 않았다” 또는 구체성 최하위로 분류하지 않는다.** 빈 원문도 원장/시스템 기본값 의미를 확인해 실제 빈 제출인 경우에만 공란으로 기록한다.
- 구조화 필드와 당시 원문이 충돌하면 하나를 우선해 소거하지 않는다. 기본값 자동입력인지, 수정 시점 차이인지 확인하고 해결 근거를 남긴다.
- 본문에 특정 내용을 적지 않은 상태와, 첨부를 읽지 못해 그 내용을 모르는 상태를 분리한다. `text_only` 관측과 `text_plus_attachment` 관측은 별도 feature set으로 계산하고 두 집단에서 동일한 자료 접근 범위를 사용한다.

## 3. 변수 사전

출처 기호: **D** = [DATA_SCHEMA.md](../../DATA_SCHEMA.md)에 필드가 문서화됨(실제 DB 존재·채움·시점은 미검증), **X** = 스키마 문서에서 확인되지 않은 추가 자료, **R** = 원문 근거로 새로 분류해야 함. D가 곧 T0 사용 가능·CaseLab 적재 완료라는 뜻은 아니다. 변수 우선순위는 P1=기본 비교, P2=조건부 확장. P2도 확보 목록에서 제외하지 않는다.

### A. 제출 정보의 구체성

모든 A 변수는 **표현의 구체성**이다. 실제 사업성·개발 난이도·고객 의지·예산 적정성을 평가하지 않는다. 해당 분석의 원문 전체를 읽을 수 있지만 표현이 없으면 A축은 `value_status=observed`와 아래 `no_stated_*` 값으로 기록한다. 이는 **관측된 표현 부재**이지 실제 준비 여건 부재가 아니다. 원문 자체 미확보/판독 불가와 구분해, 실제 빈 제출문도 비교 대상에 남긴다. B축 실제 여건의 미언급은 여전히 `not_recorded`다.

| ID / 우선순위 | 정의·허용값 | 포함 예 / 제외·반례 | 후보 출처 |
|---|---|---|---|
| `purpose_specificity` P1 | `no_stated_purpose` 표현 없음 / `artifact_only` 무엇을 만들지만 언급 / `use_case` 사용자·상황·용도 중 하나와 연결 / `problem_or_goal` 해결할 현행 문제 또는 기대 변화 명시 | “앱 제작”→artifact_only, “기사의 배차 확인 앱”→use_case, “전화 배차 누락을 줄임”→problem_or_goal. “최고의 혁신 플랫폼”은 구체 목표 아님 | D 초기 `description`; R |
| `workflow_specificity` P1 | `no_stated_function` 표현 없음 / `function_names` 기능명만 / `action_context` 주체·행동·대상 또는 입력→출력 중 하나 구체 / `flow_rules` 위 요소에 순서·조건·예외 중 하나 추가 | “회원·예약·결제”→function_names, “관리자가 예약 승인”→action_context, “승인 후 고객에게 알림, 정원 초과는 대기”→flow_rules. 기능 수가 많다는 이유로 승격 금지 | D 초기 `description`; R |
| `scope_boundary` P1 | `no_stated_scope` 표현 없음 / `work_items` 맡길 업무 목록 / `explicit_boundary` 포함·제외·기존 활용 영역 구분 | “기획·디자인·개발”→work_items, “디자인 제공, API 서버만 의뢰”→explicit_boundary. 최신 공고의 검수자 보완 문장은 제외 | D 초기 `description`; R |
| `target_user_defined` P2 | `no_stated_user` 표현 없음 / `role_named` 실제 사용자 역할 명시 / `segment_and_context` 대상군+사용 상황 / `undecided` 미정 명시 | “관리자·배송기사”→role_named, “병원 구매담당자가 주간 소모품 발주”→segment_and_context. 발주사 업종과 사용자의 업종 동일시 금지 | D 초기 `description`; R |
| `deliverable_defined` P2 | 필요한 산출물 종류의 다중 라벨: `source_code`, `design`, `document`, `deployed_service`, `prototype`, `other`; 완전히 읽었지만 미언급이면 observed 빈 배열 | “소스코드와 서버 배포 포함”→두 라벨. 앱이라는 단어만으로 소스코드 인도 추정 금지 | D 초기 `description`; R |
| `acceptance_criterion` P2 | `no_stated_criterion` 표현 없음 / `checkable` 검수 가능한 조건 명시 / `subjective` 만족·품질 같은 추상 조건만 | “동시 접속 500명에서 응답 2초 이내”→checkable. “오류 없이 잘”→subjective. 고객이 수치를 안 썼다고 준비 부족 단정 금지 | D 초기 `description`; R |
| `initial_text_chars` P2 | HTML entity 해제·태그 제거·연속 공백 하나로 정규화 후 Unicode code point 수. 원본 길이도 유지 | 본문 작성량의 기술통계일 뿐. 이름·URL·양식이 길이를 늘릴 수 있음 | D 초기 `description`; 결정적 계산 |
| `template_only` P2 | 템플릿 버전이 검증된 경우만 `yes`/`no`; 본문이 양식·예시 문장뿐인지 | 양식 아래 “관리자 예약 승인 기능” 한 줄이 있으면 no. 템플릿 목록이 없으면 `unavailable` | X 당시 입력폼/템플릿; R |
| `attachment_count_t0` P1 | 제출까지 존재한 프로젝트 연결 파일 개수. 정확히 확인한 0은 explicit_none | 제출 후 올라온 5개를 포함 금지. 현재 삭제된 파일도 당시 존재했다면 개수에 포함 | D `project_projectfile` 파일 ID·연결키·시각 |
| `attachment_kind` P2 | 읽은 파일별 다중 라벨: `requirements`, `wireframe_design`, `workflow`, `technical_asset`, `business_intro`, `reference`, `other` | 회사소개서→business_intro. 파일명 “기획서.pdf”만으로 requirements 확정 금지 | D 파일 메타데이터; X 읽기 가능한 원본; R |
| `attachment_substance` P2 | `project_specific` 대상 과업에 관한 기능/화면/흐름/제약 중 하나 확인 / `generic_only` 회사소개·일반 참고만 / `empty` 빈 내용 | 기획서 1쪽도 프로젝트 기능이 있으면 project_specific. 80쪽 회사 연혁은 generic_only. 판독 못 하면 unavailable | X 파일 본문; R |
| `reference_specificity` P2 | `no_stated_reference` 표현 없음 / `link_only` URL만 / `target_behavior` 참고할 특정 기능·화면 명시 | “A사이트의 검색 필터 방식”→target_behavior. 링크를 현재 열어 과거 요구사항을 새로 추론하지 않음 | D 초기 `description`; R |

첨부 시점 판정은 `date_created <= submitted_at` 및 (`date_removed IS NULL` 또는 `date_removed > submitted_at`)이다. **현재 연결키가 당시 연결을 보장하는지** 확인해야 한다. `temporary_project_id`로 올린 파일은 임시→정식 프로젝트 매핑을 검증한 경우만 연결한다. 현재 파일 삭제로 본문을 못 읽어도 당시 파일 수를 0으로 바꾸지 않는다. 파일 존재와 내용 판독 가능 여부는 각각 기록한다.

긴 문장 한 개에 여러 구체 항목이 있어도 조건을 충족하면 해당 범주로 분류한다. 기능이 한 개뿐인 단순 프로젝트도 흐름·규칙이 명확하면 `flow_rules`다. 복잡한 프로젝트를 자동으로 구체적이라고 판단하지 않는다.

순서가 있는 A변수는 **인용 근거로 충족되는 가장 구체적인 범주** 하나를 사용한다. 따라서 `flow_rules`는 적어도 하나의 기능에서 흐름/조건이 확인되었다는 뜻이지 전체 기능 명세가 완성되었다는 뜻이 아니다. 서로 상충하는 설명을 더 높은 범주로 덮지 말고 conflict로 보낸다. 서식·문장력·전문용어 사용·존댓말·오탈자는 판정 기준에 넣지 않는다.

### B. 실제 추진 여건에 관한 기록

| ID / 우선순위 | 정의·허용값 | 포함 예 / 제외·반례 | 후보 출처 |
|---|---|---|---|
| `budget_funding_status` P1 | `secured` 집행 가능한 돈 확정 / `approval_pending` 내부 승인 대기 / `funding_pending` 투자·지원금·매출 조건부 / `estimate_only` 금액 확인 후 결정 / `not_secured` 미확보 명시 | “3천만원 예산 승인 완료” secured. 입력칸 3천만원, “예산 있음”만으로 확정 승인·실집행 가능 추론 금지 | X 예산 승인 질문/CRM; D 초기 본문·`zpzg` 키 후보; R |
| `funding_source` P2 | `own_funds`, `government_support`, `investment`, `customer_payment`, `other` 다중 라벨 | 지원사업 프로젝트라도 자부담 병행 가능. 지원사업 여부와 선정 여부 구분 | D `is_supporting_project`, `supporting_project`; R |
| `support_funding_confirmed` P2 | 지원사업 대상에 한해 선정/사업비 확정 `yes`/`no` | `is_support_cost`의 실제 UI 문구·기본값 확인 후 매핑. 지원사업비 확정에서 기업 전체 예산 확정으로 확장 금지 | D `detail_projectdetail.is_support_cost` |
| `start_intent` P1 | `dated` 특정 날짜 / `relative` 제출·계약 등 기준+기간 / `asap` 즉시·가능한 빨리 / `conditioned` 승인·선정 등 조건 충족 후 / `undecided` 미정 명시 | “계약 후 2주” relative. “빠르게”가 확정 착수일을 뜻하지 않음 | D `launch_date`, `max_launch_date`, `launch_date_option`, 초기 본문 |
| `deadline_basis` P1 | `hard_external` 행사·지원사업 등 외부 기한 명시 / `internal_target` 내부 목표 / `duration_only` 착수 후 기간만 / `flexible` 일정 협의·유연 명시 | “11/1 박람회 시연 필수” hard_external. 날짜만 있고 이유가 없으면 `date_without_basis` 추가 값 | D 초기 `term`·본문; X CRM/질문 |
| `decision_authority` P1 | `final_decider` 최종 승인권자 / `delegated` 위임 한도 내 결정 / `recommender` 검토·추천 후 승인 필요 / `researcher` 정보 수집 담당 | “대표가 최종 결정, 저는 비교 견적 담당” recommender. 담당자 직급/대표자 이름만으로 권한 추론 금지 | X 담당자 역할·승인 질문; D `zpzg` 구조 미확인; R |
| `approval_path` P2 | `single_approver`, `multiple_approvers`, `procurement_or_tender`, `no_extra_approval` | 두 연락처가 있다고 다단계 결재 아님. 구체 승인 조건을 raw에 보존 | X 승인 절차 질문/CRM/당시 상담 |
| `project_owner_assigned` P1 | 프로젝트 추진·조율 담당자가 정해짐 `yes`/`no` | 계정 가입자/연락처 존재만으로 전담 담당자 배정 추정 금지 | X 역할 질문/CRM; R |
| `internal_staff_present` P1 | 프로젝트 관련 내부 인력의 존재 `yes`/`no`; 역할과 실제 투입 여부 별도 | 현재 `inside_manpower=true`의 UI 의미·시점을 확인. 단순 회사 전체 직원 유무와 구분 | D `inside_manpower`, `detail_inside_manpower` |
| `internal_developer_present` P1 | 고객 조직에 내부 개발자가 존재하는지 `yes`/`no` | 내부 기획자 1명→개발자 값 not_recorded. 개발자가 바쁘더라도 존재는 yes. 외주 파트너는 내부 개발자 아님 | D `detail_inside_manpower` 상세; X 역할별 인력 질문; R |
| `internal_developer_available` P1 | 해당 과업에 기술 판단·협업을 제공할 수 있는지 `yes`/`no`/`assignment_pending` | 개발자 재직이 확인되어도 이 프로젝트에 투입되는지는 별도 근거 필요. 개발자 부재 확인 시 no와 해당 근거 기록 | X 과업별 배정/투입 질문; R |
| `existing_asset` P1 | `operating_service`, `source_code`, `design`, `requirements_doc`, `data`, `api_document`, `prototype`, `other` 다중 라벨 | “운영 중 서비스 개선” operating_service. URL 존재만으로 서비스 운영 여부 추정 금지 | D 초기 본문·`detail_plan_status`; X 원본 첨부; R |
| `asset_access_ready` P2 | 필요한 기존 자산·계정·권리를 사용할 수 있음 `yes`/`no`/`pending_permission` | “소스코드는 이전 업체가 보유하고 협상 중” pending_permission. 서비스 존재로 소스 접근 가능 추정 금지 | X 기술자산/권한 질문; R |
| `planning_material_self_report` P1 | 구조화 자기보고 `idea`, `detail`, `document` 원값 유지 | document 선택이 실제 문서 품질 검증을 뜻하지 않음. 첨부 없음은 보유 문서 없음과 다름 | D `plan_status`, `detail_plan_status`; 프로젝트 `planning_status`와 별도 보존 |
| `prior_outsourcing_experience` P1 | 고객이 이전 외주 관리 경험을 명시 `yes`/`no` | 위시켓 이전 계약 0건과 외주 경험 없음은 다름 | D `has_manage_experience`의 소속 필드·시점 검증 |
| `engagement_intent` P1 | `procure_now` 실행 파트너 탐색 / `estimate_feasibility` 가격·가능성 확인 / `collect_information` 탐색 / `accidental_or_test` 실수·테스트 명시 | “견적 요청”만으로 estimate_feasibility 확정 금지(모든 발주가 견적 필요). 의도 근거가 있어야 함 | D `submit_purpose` 실제 코드 미확인·초기 본문; X 질문; R |
| `external_dependency` P2 | `funding`, `approval`, `third_party`, `data_or_rights`, `other` 다중 라벨 | 아직 풀리지 않은 실행 선행조건만. 단순 API 연동 요구는 의존 문제 미해결 증거 아님 | D 초기 본문; X 질문/CRM; R |

`internal_staff_present`와 `internal_developer_present`는 다른 변수다. `project_owner_assigned`·`decision_authority`·`approval_path`도 합치지 않는다. 예산 액수와 예산 확보 상태, 일정 숫자와 외부 고정 기한 역시 독립 변수다. 각 문항에 “미정”이라는 명시적 응답이 있으면 not_recorded가 아니라 해당 observed 범주다.

### C. 프로젝트 내용

아래 라벨은 관계가 없는 내용을 한 대분류로 합치지 않도록 **과업·목적·제약을 분리**한다. 복수 선택 가능한 축은 비율 합계가 100%가 아닐 수 있고, 해당 라벨 있음/없음 비교는 **라벨 전체가 실제 판독된 같은 표본 안에서만** 한다.

내용 태그의 비교군은 “동일한 원문을 판독했으나 해당 내용이 **기록되지 않은** 집단”이라고 표기한다. 현실에 그 제약이 없다고 주장하지 않는다. B축의 실제 여건은 `yes` 대 명시적 `no`를 기본 비교하고, 미언급은 별도 집단으로 둔다. 본문이 사라져 판독하지 못한 프로젝트는 어느 쪽 음성 집단에도 넣지 않는다.

| ID / 우선순위 | 정의·허용값 | 포함 예 / 제외·반례 | 후보 출처 |
|---|---|---|---|
| `project_lifecycle` P1 | `new`, `renewal`, `maintenance`, `mixed` | 기존 쇼핑몰과 물류 연결은 무조건 new 아님. new와 renewal 과업이 함께 명시된 경우만 mixed | D `project_purpose`; 초기 본문 검증 |
| `work_scope` P1 | `planning`, `design`, `development`, `configuration`, `integration`, `migration`, `maintenance`, `consulting`, `hardware`, `other` 다중 라벨 | “사방넷 초기 설정”→configuration, 연결 구현도 요구하면 integration 추가. 단순 언급된 SaaS마다 integration 추가 금지 | D 카테고리 관계·초기 본문; R |
| `business_goal` P1 | `launch_new_service`, `improve_existing_service`, `automate_operations`, `connect_existing_systems`, `validate_idea`, `repair_or_stabilize`, `compliance_or_deadline`, `other` 다중 라벨 | “정부지원사업 검증용 시제품” validate_idea. 정부지원금 사용만으로 compliance_or_deadline 부여 금지 | D 초기 본문; R |
| `delivery_surface` P2 | `web`, `mobile_app`, `desktop`, `backend_api`, `data_ai`, `hardware_embedded`, `design_only`, `other` 다중 라벨 | AI 기능이 필요하다고 모든 웹 과업을 data_ai 단일 분류로 대체하지 않음 | D 초기 본문·당시 카테고리; R |
| `use_domain` P2 | `commerce`, `enterprise_operations`, `healthcare`, `education`, `finance`, `logistics`, `content_community`, `industrial_hardware`, `other` 다중 라벨 | 물류 ERP 연동→enterprise_operations+logistics. 이름이 “병원”이라도 프로젝트 사용영역 확인 필요 | D 분야 관계·초기 본문; R |
| `user_audience` P2 | `internal_staff`, `business_customer`, `consumer`, `public_user`, `mixed` | 내부 발주 시스템→internal_staff. 회사가 발주한다고 B2B 서비스라 부르지 않음 | D 초기 본문; R |
| `technical_constraint` P1 | `fixed_stack`, `legacy_environment`, `named_external_system`, `required_hardware`, `data_migration`, `performance_requirement`, `security_regulatory`, `onsite_or_location`, `other` 다중 라벨 | 특정 기술이 반드시 필요하거나 실제 연동 대상임이 명시되어야 함. “React 등 제안”은 fixed_stack 아님 | D 초기 본문·qualification; R |
| `technology_choice` P2 | `fixed`, `existing_environment`, `proposal_welcome`, `undecided` | “언어 무관, 추천 요청” proposal_welcome은 기술 모름/준비 부족이 아님 | D 초기 본문·당시 skills; R |
| `initial_budget_krw` P1 | 초기 총예산 원값. 외주/기간제, VAT 포함 여부 별도 표시 | 0은 무료 발주인지 미입력 기본값인지 확인 전 수치분석 제외. 현재 모집 예산으로 대체 금지 | D initialvalue.budget; 금액 의미 검증 |
| `budget_negotiability` P2 | `fixed_cap`, `negotiable`, `quote_requested` | 금액 입력만으로 fixed_cap 추정 금지. 초기 budget_option T0 복원 필요 | D `budget_option`·초기 본문 |
| `initial_duration` P1 | 초기 기간 원값. 현행 매핑의 실측 주석은 term이 항상 일수라고 명시하므로 일수 후보로 보존하고 초기값도 같은 의미인지 검증 | `term_type=month`를 이유로 30배 금지. 모집 마감일은 납품일이 아님 | D initialvalue.term; 실제 값/입력폼과 현행 mapping.ts 검증 |

프로젝트 예산이 “적정한지”는 이번 분류자가 주관적으로 판단하지 않는다. 예산×과업 범위의 관측 전환율은 비교할 수 있으나, 낮은 전환율을 곧 과소예산의 증거로 표현하지 않는다. 기술 제약 라벨도 개발 난이도나 공급 부족의 확정 판정이 아니다.

### D. 고객 특성과 과거 이력

| ID / 우선순위 | 정의·허용값 | 포함 예 / 제외·반례 | 후보 출처 |
|---|---|---|---|
| `business_form_t0` P1 | `individual`, `team`, `individual_business`, `corporate_business`; 원천 코드 유지 | 회사명이 없다고 individual 확정 금지. 법인이 곧 큰 기업은 아님 | D `client_clientinfo.form_of_business`·시점 검증 |
| `company_size_t0` P2 | 실제 새 문항의 정의·범주·도입일을 확인 후 그 값 그대로 유지 | 최근 회사규모를 1월 제출에 소급 금지. 기업형태/회사명/프로젝트 예산으로 규모 대체 금지 | X 최근 추가 폼·실제 스키마·응답시각 |
| `company_industry_t0` P2 | 발주 고객의 사업 업종. 프로젝트 use_domain과 분리 | 병원용 SaaS를 만드는 IT 회사의 고객 업종은 IT일 수 있음 | X 새 필드/CRM/당시 회사소개; 직접 확인된 값만 |
| `client_prior_submissions` P1 | 동일 client_id의 이번 제출 이전 **프로젝트 유형 전체** 제출 건수; 외주만은 별도 `client_prior_task_submissions` | 현재 `project_created` 누계 금지. 초안 생성은 제출 건 아님. 기간제 이용 경험자를 플랫폼 신규로 오분류하지 않음 | D 전체 project_project의 client_id·제출시각 |
| `client_prior_recruitments` P1 | 유형 전체에서 이번 제출 이전 실제 모집 시작이 있었던 프로젝트 수; 외주만은 별도 `client_prior_task_recruitments` | 과거 제출되었지만 이번 제출 뒤 모집된 건 제외 | D 모집 시작 이력 |
| `client_prior_contracts` P1 | 이번 제출 이전 유효 계약을 체결한 프로젝트 수 | 현재 누적 계약수·현재 계약 상태를 과거 고객 경험으로 대체 금지. 현재 유효 계약만 필터링해 과거 취소 계약을 없애면 과거 상태를 복원한 것이 아님 | D 계약·특약의 날짜/당시 유효성 이력. 현재 유효 상태만 확보하면 time_unverified로 T0 제외 |
| `client_tenure_days` P2 | 해당 제출시각−검증된 클라이언트 등록시각 | 실제 계정 가입시각과 고객 프로필 생성시각이 다르면 명칭 구분 | D client_client.date_created; X account 등록 정의 |
| `acquisition_source` P2 | `signup_source`, `project_source`, `campaign_source`를 별도 feature_id로 저장 | client.acquisition_path는 가입 경로. 현재 프로젝트 광고/UTM 유입으로 대체 금지 | D acquisition_path; X 이벤트·UTM·CRM |
| `agency_or_end_client` P2 | `end_client`, `agency`, `reseller`, `other` | “고객사 승인 필요” 등 직접 근거. 회사명만으로 대행사 판정 금지 | X 역할·거래 구조 문항; 초기 본문 R |

기업 규모 항목의 수집 시작일은 **사용자 확인 2026-09-03**이다. 실제 필드/다른 DB 스키마는 사용자 제공 대기이며 채널별 배포 범위·대상·필수/선택·값 정의를 추가 검증한다. 도입 전은 구조적 미수집이다. 도입 후에도 추적 기간을 채운 최근 제출끼리만 비교하며 표본·결과가 부족하면 데이터 수집 현황만 낸다. 개발자·의사결정·예산 확보·일정 등의 다른 DB 보유 가능성은 조사 대상이지 이미 존재 확인된 자료로 표시하지 않는다.

### E. 숫자 구간과 일자 변환 규칙

- 예산은 원 단위 raw를 보존한다. 외주 총액 분석 기본 구간은 `0<금액<500만원`, `500만~1천만원 미만`, `1천만~3천만원 미만`, `3천만~5천만원 미만`, `5천만~1억원 미만`, `1억원 이상`이다. 0·음수·해석 불명은 별도 상태로 둔다. 결과를 본 뒤 경계를 바꾸지 않는다.
- 기간은 **초기 값이 일수임을 검증한 건만** 비교한다. [현행 매핑](../../src/lib/sync/mapping.ts)은 2026-07-13 실측 근거로 `term`이 항상 일수이며 `term_type=month`는 월 예산 단가 의미라고 명시한다. 오래된 DATA_SCHEMA/DATA_INTEGRATION의 기간단위 설명과 충돌하므로 초기 필드까지 실제 의미를 확인하고, `term_type`에 따른 30배 환산은 하지 않는다. 검증 후 구간은 `(0,30]`, `(30,90]`, `(90,180]`, `>180`일이다. 이 수치는 난이도/적정기간 기준이 아니다.
- 특정 착수일이 있으면 제출일(KST)과의 일수 차이를 보존하고 `<0`, `0~7`, `8~30`, `31~90`, `>90`일로 기술한다. ASAP·조건부·미정은 0일로 치환하지 않는다.
- 과거 제출·모집 건수는 각각 `0`, `1`, `2~4`, `5+`; 과거 계약은 `0`, `1+`로 기본 비교한다. 원천 이력의 시작일 때문에 과거 전체가 보이지 않으면 **“관측 기간 내 과거 이력”**이라고 부르고 신규 고객 확정 표현을 쓰지 않는다.
- 글자 수는 중앙값·사분위수 등 기술통계만 기본 제시한다. 길이 기반 “준비 높음” 구간을 만들지 않는다. 텍스트 길이 효과를 탐색한다면 다른 구체성 변수와 별개의 보조 가설이다.
- 원천 타임존을 검증한 후 KST로 변환한다. 날짜만 있는 자료로 제출 전/후 순서를 판별할 수 없는 당일 사건은 시점 미확인 처리한다.

## 4. 거절·취소 사유 분류

사유는 원인에 관한 **운영상 기록**이다. 고객의 실제 내적 동기 또는 인과효과가 입증된 것이 아니다. 원천 `cancel_type` 코드와 UI 문구를 먼저 확인하고 `reason_raw_code`, `reason_raw_label`, `reason_raw_text`를 보존한다. 모집 전 거절·고객 취소만 이 분석의 사유 모집단이다.

세부 사유 후보는 `test_or_mistake`, `information_only`, `unreachable`, `no_budget_or_funding`, `approval_or_priority_changed`, `schedule_mismatch`, `scope_or_platform_eligibility`, `other_provider_or_inhouse`, `duplicate_registration`, `other_explicit`, `unknown`이다. 실제 사유 코드의 정의를 확인해 교정 단계에서 매핑표를 동결한다. 원천 “기타”는 이 중 어느 하나로 자동 치환하지 않는다.

- “둘러보다 잘못 등록”, “테스트 등록”은 `test_or_mistake`의 직접 근거다. “견적만 먼저 확인하고 다음 달 결정”은 `information_only`이며 실수 등록이 아니다.
- 연락두절은 실수 등록의 증거가 아니다. 입력이 짧음, 예산 0, 개인 고객도 테스트의 증거가 아니다.
- `primary_reason`은 원천 선택 사유를 매핑한다. 자유서술에 복수 이유가 명시되면 `reason_tags`를 다중 라벨로 보존하되 임의 순위로 주사유를 정하지 않는다. 주사유가 미확인인 건은 unknown이다.
- 사유 인용과 발생/작성 시점을 저장한다. T2 사유를 T0의 `engagement_intent`, `budget_funding_status` 등에 역입력하지 않는다.
- “기타 중 테스트 비율”에는 기타 선택 전체 건수, 실제 자유서술 존재 건수, 판독/분류 건수, 미상 건수를 함께 표시한다. 판독 가능한 표본의 비율을 기타 전체의 정확한 비율이라고 보고하지 않는다.

## 5. 분류 절차·품질 기준·작업량

### 수행 순서

1. **필드 자격 확인**: 실제 필드, 당시 질문 문구·기본값, 시점, 결측 원인을 검증한다. 비교 결과를 열기 전에 각 변수의 T0/T1 사용 가능 여부를 등록한다. 코호트 원장과 실제 자료 수집 표는 주 분석 계획을 따른다.
2. **검증 표본 예약 후 교정 40건**: 먼저 분석 가능 원장 전체에서 검증용 80건을 단순무작위 비복원 추출해 예약하고 ID·난수 seed를 보존한다. 그 80건과 겹치지 않는 원장에서 월·등록 경로·글 길이·파일 유무·재이용 여부가 다양한 교정 40건을 고른다. 표본 담당자만 결과를 보고 필요 시 결과집단도 고르게 섞되, 분류자 화면에는 결과·거절사유·현재 공고·계약여부를 제거한다. 두 사람이 독립 분류 후 규칙을 수정한다. 교정 성능은 검증 성능이 아니다.
3. **v1.0 동결**: 문항별 예/반례·누락 처리·허용값·AI 프롬프트(사용 시)를 고정하고 소스 버전을 기록한다. 이후 결과를 보고 라벨을 바꾸면 v1.1 탐색으로 분리하고 영향을 받는 표본 전체를 다시 분류한다.
4. **예약한 대표 검증 80건**: 규칙 동결 후 두 사람이 독립 분류하며 결과를 가린다. 검증 80건 합의 라벨은 최소 본분석 표본으로도 쓸 수 있으나, 교정40/희귀라벨 보강을 섞지 않는다. 희귀 라벨 양성이 10건 미만이면 별도 정밀 검증 표본을 추가할 수 있으나 대표 성능과 구분한다. 실제 추출 확률과 seed를 저장한다.
5. **본 분류**: 구조화 값·시점 검증으로 확정되는 변수는 전수. 텍스트는 기본적으로 대표 검증 80건의 결과 범위를 명시한다. AI 보조 전수 분류를 선택하면 검증을 통과한 변수만 전체 원문에 적용하고 교정40건도 동결 규칙으로 재분류한다. 유료 호출·외부 파일 전송은 실제 범위·비용/처리환경을 확인한 별도 실행 단계다. 층화·결과균형 표본을 사용하면 선택확률/가중치를 보존하되 일반 Wilson/Newcombe CI는 적용하지 않는다.

### 라벨 신뢰도 보고

- 변수별로 대표 검증 표본 수, observed/결측 분포, 단순 일치율, Cohen의 κ, 불일치 표와 합의 후 기준 라벨을 남긴다. 기본 κ는 `value_status+value`를 하나의 범주로 한 비가중 κ라 결측 판정 불일치도 포함한다. 순서형 A변수는 두 분류자 모두 observed인 경우에 한해 선형 가중 κ를 추가하되 그 조건부 표본 수도 표시한다. 다중 라벨은 각 라벨의 양성/음성 일치와 표본 수를 별도 보고한다. κ 계산 불가·희귀 양성에서는 해당 사실을 표시하고 1.0으로 채우지 않는다.
- 이번 작업의 **운영상 통과 기본값**은 일치율 85% 이상 및 계산 가능한 κ 0.70 이상이다. 보편적 과학 기준이나 변수 타당성의 증명으로 표현하지 않는다. 한 범주로 치우쳐 κ가 낮으면 일치율만으로 통과시키지 않고 불일치 원인·양성 일치·표본을 검토한다. 검증 표본 양성 10건 미만인 라벨은 수치가 좋아도 탐색용이다.
- 미달한 변수는 기준을 좁혀 새 표본으로 재검증하거나 이번 정량 비교에서 제외한다. 일정상 재검증 불가이면 “분류 신뢰도 미확보”로 제외한다. 불일치를 모두 합의했다고 최초 재현성이 높았다고 보고하지 않는다.
- AI를 쓰면 동결된 사람 합의 라벨에 대한 클래스별 precision/recall 및 건수를 추가 보고한다. 검증되지 않은 AI 라벨은 가설 탐색용으로만 사용한다. 모델이 반환한 “확신 90%”를 정확도나 분석 결론의 신뢰도로 사용하지 않는다.
- **추출/분류 신뢰도, 특성의 통계적 차이에 대한 불확실성, 인과적 확신을 각각 분리**한다. 잘 분류한 변수도 차이가 없을 수 있고, 차이가 커 보여도 표본이 작으면 결론을 보류한다. 통계적 차이·신뢰구간·다중 비교·재검증은 주 분석 계획을 따른다.

### 작업량 기본 배정

교정 40건×2명 + 대표 검증 80건×2명 = **240회 독립 판독**이다. 문서 읽기를 포함해 건당 8~12분이면 총 32~48인시, 불일치 조정 4~6인시를 추가한다. 첨부 전체 판독은 이 추정에 들어맞지 않을 수 있어 첫 10건에서 실제 시간을 재측정한다. 운영 확인·추출·통계 시간은 별도다.

9월 29일 일정에서는 우선 P1 변수를 검증한다. 교정에서 P1만 읽어도 건당 12분을 넘거나 원본 접근이 막히면 첨부 내용 P2, 상세 기술 P2를 뒤로 미루고 **검증 규칙을 느슨하게 만들지 않는다**. 전체가 120건 미만이면 먼저 floor(N×2/3)건을 무작위 검증용으로 예약하고 나머지를 교정용으로 사용한다. 전량 판독해도 교정 표본을 독립 검증 성능에 섞지 않는다. 검증 건수가 부족한 범주는 탐색/미측정으로 표시한다. 본 분류 대상 수와 AI 적용 여부는 실제 데이터량·첫 10건 소요시간을 확인해 기록한다.

## 6. 분석에 들어가기 전 통과 확인

- [ ] 변수마다 source, 실제 질문/코드 의미, 유효 시기, T0/T1 자격, 결측 상태가 정해짐
- [ ] 모집·거절 양쪽에서 같은 입력 시점과 자료 범위를 사용함
- [ ] 첨부 없음/문서 없음/파일 접근 불가를 구분했고 제출 당시 파일 개수 재현 가능
- [ ] 회사 규모 신규 수집 이전을 개인/소기업/미응답으로 채우지 않음
- [ ] 내부 인력과 개발자, 대표자명과 승인권, 예산 액수와 확보를 분리함
- [ ] 구조화 최신값과 현재 고객 누적 이력을 과거 값으로 사용하지 않음
- [ ] 분류자는 결과를 가린 자료를 사용하고 규칙은 비교 결과를 보기 전에 동결함
- [ ] “짧지만 전환됨”, “첨부 없이 전환됨”, “자세하지만 거절됨”도 같은 규칙으로 유지함
- [ ] 전환율 차이가 없거나 신뢰도가 부족하면 “확인되지 않음”이라고 보고할 수 있음
- [ ] 마케팅 가설에는 그 특성을 유입 단계에서 실제로 식별할 수 있는지도 별도로 적음

규칙이 있어도 미수집 사실을 만들어낼 수는 없다. 항목이 확보되지 않거나 시점을 검증할 수 없으면 그 변수의 분석을 제외하고 필요한 추가 질문·자료를 산출물에 남긴다. 이것은 분석 실패를 숨기는 보완 설명이 아니라 사전에 정한 정상 종료 조건이다.
