# CaseLab — 본진(Wishket) DB 스키마 & 연동 레퍼런스

> 출처: wishket-db MCP ERD + live information_schema + 통화 API 헬스체크 기반 조사 답변.
> CaseLab은 **읽기 전용(Read-only) 분석 서비스**로 설계 가능. 본진 DB는 수정하지 않는다.
> "검수 매니저가 바뀌어도 추적"은 아래 3개 축을 함께 봐야 함:
> - 현재 담당자: `project_project.inspection_manager_id`, `management_manager_one_id`, `management_manager_two_id`
> - 내부 코멘트/히스토리: `management_managenote`, 레거시 `projecthistory_projecthistory`
> - 미팅 담당자: `meeting_meeting.manager_id`, `manager_tuned_id`

---

## 0. 핵심 ERD 요약

| 목적 | 메인 테이블 | 핵심 FK |
|---|---|---|
| 프로젝트/공고 | `project_project` | `client_id`, `inspection_manager_id`, `management_manager_one_id`, `management_manager_two_id` |
| 프로젝트 원본 스냅샷 | `project_projectinitialvalue` | `project_id` OneToOne |
| 프로젝트 상세 조건 | `detail_projectdetail` | `project_id` OneToOne |
| 클라이언트 | `client_client`, `client_clientinfo`, `client_clientworker` | `client_client.user_id`, `client_clientinfo.project_id`, `client_clientworker.project_id` |
| 내부 코멘트/히스토리 | `management_managenote`, `projecthistory_projecthistory` | `project_id`, `agreement_id`, `created_by_id`, `action_by_id` |
| 지원/입찰 | `proposal_proposal` | `project_id`, `partners_id` |
| 파트너 프로필 | `partners_partners` | `user_id` |
| 미팅 | `meeting_meeting` | `project_id`, `proposal_id`, `manager_id` |
| 첨부파일 | `project_projectfile` | `project_id`, `temporary_project_id` |
| 계약 | `agreement_agreement`, `sub_contract_subcontract`, `milestone_milestone` | `agreement.project_id`, `sub_contract.agreement_id`, `milestone.contract_id` |
| 분류/카테고리 | `project_field_*`, `tags_projectskilltag` | `project_id`, `field_subcategory_id`, `object_id` |

---

## 1. 프로젝트(공고) 마스터 데이터

### 1-1. 메인 테이블: `project_project`

클라이언트가 등록한 외주/기간제 프로젝트의 핵심 마스터 테이블.

| 항목 | 컬럼명 | 타입 | 설명 |
|---|---|---|---|
| 프로젝트 PK | `id` | int(11) AutoField/BigAutoField | 프로젝트 고유 ID |
| 프로젝트명/제목 | `title` | varchar(100) | 프로젝트 제목 |
| 원본/상세 요구사항 | `description` | longtext (max 5000) | 클라이언트 작성 상세 업무 내용 |
| 예산 | `budget` | decimal(10,0) | 예상 예산, 원 단위, VAT 별도. 외주=총액, 기간제=월 단가 |
| 예상 기간 | `term` | int unsigned | 예상 진행 기간, 기본 일 단위 |
| 기간 단위 | `term_type` | varchar(10) | `month`, `day` |
| 등록일시 | `date_created` | datetime | 최초 생성 |
| 수정일시 | `date_modified` | datetime | 최종 수정 |
| 제출일시 | `date_submitted` | datetime nullable | 검수 제출 시점 |
| 모집 시작일시 | `date_start_recruitment` | datetime nullable | 파트너 모집 시작 |
| 모집 마감일시 | `date_deadline` | datetime | 지원자 모집 마감 |
| 삭제일시 | `date_deleted` | datetime nullable | 소프트 삭제 |
| 프로젝트 상태 | `status` | varchar(20) | 라이프사이클 상태 |
| 취소 여부 | `is_cancelled` | tinyint(1) | 취소 여부 |
| 검수 거절 여부 | `is_rejected` | tinyint(1) | 검수 거절 여부 |
| 검수 매니저 | `inspection_manager_id` | FK → auth_user.id | 검수 담당 매니저 |
| 운영 메인 매니저 | `management_manager_one_id` | FK → auth_user.id | 관리 카드 메인 매니저 |
| 운영 서브 매니저 | `management_manager_two_id` | FK → auth_user.id | 관리 카드 서브 매니저 |
| 클라이언트 | `client_id` | FK → client_client.id | 발주 클라이언트 |
| 프로젝트 유형 | `project_type` | varchar(15) | `task_based`, `term_based` |
| 기술 문자열 | `skills_slug` | varchar(512) | 검색용 스킬 슬러그 |
| 프로젝트 키워드 | `project_keywords` | json | 프로젝트 관련 키워드 |
| 지원자 키워드 | `applicant_keywords` | json | 지원자 관련 키워드 |
| 검수 인터뷰 JSON | `zpzg` | json | 검수 시 수집하는 클라이언트 인터뷰성 데이터 |
| 위시켓 패키지 JSON | `wishket_package_json` | json nullable | 패키지 정보 |

#### `project_project` 전체 필드 목록 (ERD 기준)

```text
id, project_type, previous_project_id, premium_service_status, client_id,
anonymous_client_uuid, title, slug, description, skills_slug, budget, term,
status, is_recruiting, hide_from_list, is_private, date_created, date_modified,
date_submitted, date_start_recruitment, date_deadline, date_user_reedit,
date_deleted, location_sido_id, location_sigungu_id,
categories (M:N job.JobCategory), field (M:N project_field.ProjectField),
field_subcategory (M:N through project_field_projectfieldsubcategory),
skills (TaggableManager through tags_projectskilltag), is_required_skills,
planning_status, project_keywords, applicant_keywords, role, term_type,
is_cancelled, cancelled_by_id, date_cancelled, is_rejected, rejected_by_id,
date_rejected, cancel_type, process_id, management_label (M:N management.ManageLabel),
management_duedate, management_manager_one_id, management_manager_two_id,
management_cancel_reason, management_hide, meeting_request_lock,
notable_tags (M:N tag.NotableTag), failure_sms_sended, zpzg, wishket_package_json,
inspection_manager_id, postpone_status, postpone_date, postpone_time,
inspection_contact_datetime_string, inspection_contact_comment,
is_inspection_contact_asap, proposal_count, meta_keyword, meta_image, se_permission,
category_id (legacy FK), subcategory_id (legacy FK), method_pre_interview,
project_term, code_id, data_validation, is_turnkey, prefer_partner,
tallying_postpone, has_select_partners, submit_purpose, management_status,
management_list, management_order, management_actions, management_tags,
management_interest_partner, management_bound, is_aid_project, is_inhouse,
is_chicken_target, is_chicken, has_manage_experience, date_expected_kick_off,
category_slug, address_sido_id, address_sigungu_id
```

### 1-2. 검수 전 원본 스냅샷: `project_projectinitialvalue`

등록 시점 원본 값 보존. "검수 과정에서 요구사항/예산/기간이 어떻게 바뀌었는지" 분석 시 중요.

| 컬럼 | 타입 | 관계/설명 |
|---|---|---|
| `id` | int PK | 초기값 레코드 ID |
| `project_id` | OneToOne → project_project.id | 프로젝트와 1:1 |
| `budget` | decimal(12,0) | 등록 시 예산 |
| `description` | TextField | 등록 시 상세 내용 |
| `term` | PositiveIntegerField | 등록 시 기간 |
| `date_created` | datetime | 생성일시 |
| `date_modified` | datetime | 수정일시 |

### 1-3. 프로젝트 상세 조건: `detail_projectdetail`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 상세정보 ID |
| `project_id` | OneToOne → project_project.id | 프로젝트 상세 |
| `project_type` | varchar(25) | `task_based`, `term_based` |
| `launch_date` | date nullable | 희망 착수일 |
| `max_launch_date` | date nullable | 최대 착수 가능일 |
| `launch_date_option` | varchar(30) | 착수일 옵션 |
| `budget_option` | varchar(30) | 예산 옵션 |
| `term_option` | varchar(30) | 기간 옵션 |
| `qualification` | varchar(200) | 필수 요건 |
| `pre_question` | varchar(300) | 지원 시 사전 질문 |
| `inside_manpower` | boolean nullable | 내부 인력 존재 여부 |
| `detail_inside_manpower` | varchar(100) | 내부 인력 상세 |
| `is_supporting_project` | boolean nullable | 지원사업 여부 |
| `supporting_project` | varchar(30) | 지원사업 종류 |
| `is_support_cost` | boolean nullable | 사업비 확정 여부 |
| `priority` | varchar(40) | 금액/기간 우선순위 |
| `prefer_product` | varchar(100) | 관심 상품 |
| `project_purpose` | varchar(20) | `new`, `renewal`, `maintenance` |
| `plan_status` | varchar(20) | `idea`, `detail`, `document` |
| `detail_plan_status` | varchar(200) | 보유 기획 자료 |
| `document_share` | varchar(10) | `inspection`, `meeting`, `always` |
| `pre_meeting_method` | varchar(10) | `online`, `offline`, `both` |
| `progress_meeting_method` | varchar(10) | 진행 중 미팅 방식 |
| `progress_meeting_location` | varchar(20) | 진행 중 미팅 장소 |
| `progress_meeting_frequency` | varchar(20) | `one_for_week`, `two_for_week`, `flexible` |
| `has_manage_experience` | boolean nullable | 외주 관리 경험 |
| `future_plan` | varchar(60) | 완료 후 유지보수/고도화 계획 |

---

## 2. 프로젝트 상태(Status) 라이프사이클

| 테이블 | 컬럼 | 타입 |
|---|---|---|
| `project_project` | `status` | varchar(20) |
| `project_project` | `is_cancelled` | boolean |
| `project_project` | `is_rejected` | boolean |
| `project_project` | `date_cancelled` | datetime nullable |
| `project_project` | `date_rejected` | datetime nullable |

### `status` 가능한 값

| 값 | 의미 |
|---|---|
| `open` | 작성중 |
| `saved` | 임시저장 |
| `frozen` | 동결 |
| `submitted` | 검수중 |
| `recruiting` | 모집중 |
| `close_recruiting` | 모집마감 |
| `contracted` | 계약체결 |
| `completed` | 완료 |

일반 흐름: `open/saved → submitted → recruiting → close_recruiting → contracted → completed`

취소/실패는 별도 플래그를 함께 봐야 함: `is_cancelled=1`, `is_rejected=1`, `date_cancelled IS NOT NULL`, `date_rejected IS NOT NULL`

### 성공(계약 성사) 판단식

```sql
project_project.status IN ('contracted', 'completed')
OR EXISTS (
  SELECT 1
  FROM agreement_agreement a
  JOIN sub_contract_subcontract sc ON sc.agreement_id = a.id
  WHERE a.project_id = project_project.id
    AND a.hide = 0
    AND a.date_deleted IS NULL
    AND sc.is_incomplete_addon = 0
    AND sc.is_cancel_addon = 0
)
```

### 실패/드랍/취소 판단식

```sql
project_project.is_cancelled = 1
OR project_project.is_rejected = 1
OR project_project.date_cancelled IS NOT NULL
OR project_project.date_rejected IS NOT NULL
```

> ⚠️ 실제 데이터에서 `close_recruiting` + `is_cancelled=1` 조합이 많음. **status만 보면 안 되고 반드시 `is_cancelled`, `is_rejected`를 함께 봐야 함.**

---

## 3. 카테고리 / 태그 / 분류 체계

### 프로젝트 유형

| 컬럼 | 타입 | 값 |
|---|---|---|
| `project_project.project_type` | varchar(15) | `task_based`(외주), `term_based`(기간제) |

### 직무/상위 카테고리

`project_project.categories`는 job.JobCategory와 M:N. 레거시 단일 FK도 존재.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `category_id` | FK → job.JobCategory | 레거시 단일 카테고리 |
| `subcategory_id` | FK → job.JobSubcategory | 레거시 세부 카테고리 |
| `categories` | M:N → job.JobCategory | 개발/디자인/기획 등 복수 선택 |

### 분야/서비스 분류 (웹, 앱, 쇼핑몰 등)

**`project_field_fieldcategory`**: `id`, `name` varchar(100), `flag` varchar(100), `order` int, `is_active` boolean, `date_created`, `date_modified`

**`project_field_fieldsubcategory`**:

| 컬럼 | 타입 | 관계 |
|---|---|---|
| `id` | PK | |
| `category_id` | FK → project_field_fieldcategory.id | 상위 분야 |
| `name` | varchar(100) | 예: 웹, 앱, 쇼핑몰 하위 분야 |
| `flag` | varchar(100) | 식별 플래그 |
| `order` | int | 정렬 |
| `is_active` | boolean | 활성 |
| `is_recommend` | boolean | 추천 분야 |
| `date_created`/`date_modified` | datetime | |

**프로젝트-분야 N:M `project_field_projectfieldsubcategory`**:

| 컬럼 | 타입 | 관계 |
|---|---|---|
| `id` | PK | |
| `project_id` | FK → project_project.id | 프로젝트 |
| `field_subcategory_id` | FK → project_field_fieldsubcategory.id | 상세 분야 |
| `is_represent` | boolean | 대표 분야 여부 |
| `date_created` | datetime | 생성일 |

### 기술 태그: `tags_projectskilltag`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 연결 ID |
| `tag_id` | FK → operation.WishketTag | 태그 |
| `content_type_id` | FK | Generic relation 모델 타입 |
| `object_id` | int | 프로젝트 ID 등 대상 객체 ID |
| `date_created` | datetime | 생성일 |

프로젝트에서는 `project_project.skills` TaggableManager를 통해 연결.

### 플랫폼 유형 (웹/앱/하이브리드)

명시적 `platform_type` 단일 컬럼 없음. 아래로 판단:
`project_field_fieldsubcategory.name`, `project_project.field_subcategory`, `category_slug`, `description`, `project_keywords`.

> CaseLab에서는 "플랫폼 유형"을 정규화 필드로 기대하기보다 **분야/서브카테고리 + 태그 + AI 분류 결과**를 함께 쓰는 편이 안전.

---

## 4. 클라이언트(고객사) 정보

### 4-1. 메인: `client_client`

관계: `project_project.client_id → client_client.id`, `client_client.user_id → auth_user.id`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 클라이언트 ID |
| `user_id` | OneToOne → auth_user.id | 로그인 계정 |
| `slug` | AutoSlug | URL 슬러그 |
| `company_name` | varchar(100) | 회사명 |
| `company_description` | text | 회사 소개 |
| `website` | URL | 웹사이트 |
| `rating` | float | 외주 종합 평점 |
| `term_rating` | float | 기간제 종합 평점 |
| `all_rating` | float | 통합 평점 |
| `project_created` | int | 생성 프로젝트 수 |
| `project_arranged` | int | 계약 성사 수 |
| `project_canceled` | int | 취소 수 |
| `verified_status` | boolean | 신원 인증 |
| `acquisition_path` | varchar(30) | 가입 경로 |
| `need_monitoring` | boolean nullable | 모니터링 필요 여부 |
| `date_created`/`date_modified` | datetime | |
| `date_monitored` | datetime nullable | 모니터링 일시 |

### 4-2. 프로젝트별 고객 담당자: `client_clientinfo`

관계: `client_id → client_client.id`, `project_id → project_project.id`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 담당자 정보 ID |
| `client_id` | FK | 클라이언트 |
| `project_id` | FK | 프로젝트 |
| `full_name` | varchar(50) | 담당자명 |
| `company_name` | varchar(50) | 회사명 |
| `representative` | varchar(50) | 대표자명 |
| `company_intro` | varchar(150) | 회사 소개 |
| `form_of_business` | varchar(19) | `individual`, `team`, `individual_business`, `corporate_business` |
| `cell_phone_number` | varchar(20) | 연락처 |
| `hash_string` | varchar(32) | 정보 변경 감지용 해시 |
| `date_created` | datetime | 생성일 |

### 4-3. 프로젝트/계약별 복수 담당자: `client_clientworker`

관계: `client_id → client_client.id`, `project_id → project_project.id`, `agreement_id → agreement_agreement.id`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 담당자 레코드 |
| `client_id` | FK | 클라이언트 |
| `project_id` | FK | 프로젝트 |
| `agreement_id` | FK | 계약 |
| `name` | varchar(60) | 담당자명 |
| `cell_phone_number` | varchar(20) | 휴대폰 |
| `email` | email | 이메일 |

---

## 5. 내부 담당자(매니저) 정보

내부 매니저는 Django `auth_user` 계정으로 연결. FK들은 모두 auth.User로 명시.

| 테이블 | 컬럼 | 의미 |
|---|---|---|
| `project_project` | `inspection_manager_id` | 검수 담당 매니저 |
| `project_project` | `management_manager_one_id` | 운영 메인 매니저 |
| `project_project` | `management_manager_two_id` | 운영 서브 매니저 |
| `meeting_meeting` | `manager_id` | 미팅 담당 매니저 |
| `meeting_meeting` | `manager_tuned_id` | 미팅 조율 완료 매니저 |
| `agreement_agreement` | `core_manager_id` | 계약 담당 매니저 1 |
| `agreement_agreement` | `sub_manager_id` | 계약 담당 매니저 2 |
| `management_managenote` | `created_by_id` | 노트 작성자 |
| `management_managenote` | `action_by_id` | Todo/액션 수행자 |

한 프로젝트에 최소 3명(inspection/management_one/management_two) 직접 연결 가능. 미팅/계약 단계에서 별도 담당자 추가.

> ⚠️ "과거에 누가 담당했는지"를 정규화한 assignment history 테이블은 **없음**. 변경 이력은 `management_managenote`, `projecthistory_projecthistory`를 함께 봐야 함.

---

## 6. 매니저 히스토리 / 코멘트 / 내부 노트

### 6-1. 핵심 내부 코멘트: `management_managenote` ⭐

카드어드민 댓글창에 보이는 프로젝트/계약 관리 노트. **CaseLab에서 가장 중요.**

관계: `project_id`, `temporary_project_id`, `contract_id`, `agreement_id`, `created_by_id → auth_user.id`, `action_by_id → auth_user.id`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `temporary_project_id` | FK nullable | 임시 프로젝트 |
| `project_id` | FK nullable | 프로젝트 |
| `contract_id` | FK nullable | 레거시 계약 |
| `agreement_id` | FK nullable | 거래/계약 |
| `note_type` | varchar(20) | `todo`, `memo`, `history`, `checklist`, `review_memo`, `meeting` |
| `flag` | varchar(30) | `normal`, `bill`, `deposit`, `remittance`, `cs` 등 |
| `detail_option` | varchar(2000) nullable | 상세 옵션 |
| `body` | text nullable | 본문 |
| `created_by_id` | FK → auth_user.id | 작성자 |
| `action_by_id` | FK → auth_user.id | 액션 수행자 |
| `date_created` | datetime | 작성일시 |
| `date_action` | datetime nullable | 액션 수행일시 |
| `date_due` | datetime nullable | 마감기한 |
| `is_delete` | boolean | 소프트 삭제 |

시간순 정렬: `ORDER BY date_created ASC`

### 6-2. 레거시 히스토리: `projecthistory_projecthistory`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `project_id` | FK 추정 | 프로젝트 |
| `contract_id` | FK 추정 | 계약 |
| `projectcontract_id` | FK 추정 | 관리 계약 카드 |
| `proposal_id` | FK 추정 | 지원서 |
| `manager_id` | FK 추정 | 매니저 |
| `data_type` | varchar(3) | 기록 타입 |
| `memo_type_id` | varchar(20) | 메모 라벨 |
| `raw_data` | varchar(4096) | 원본 데이터 |
| `created_at` | datetime | 생성일시 |

> ERD 문서상 이 테이블은 부정확하게 표시됨. 실제 구현 시 information_schema로 컬럼 재확인 권장.

### 6-3. 고객/파트너에게 보이는 댓글: `comment_projectcomment`

프로젝트 상세 페이지 문의 댓글. 내부 전용 매니저 노트와 구분.

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 댓글 ID |
| `project_id` | FK nullable | 프로젝트 |
| `title` | varchar(255) | 현재 미사용 |
| `body` | text | 댓글 본문 (최대 1000자) |
| `user_id` | FK → auth_user.id | 작성자 |
| `status` | smallint | 0 비공개, 1 공개 |
| `total_votes`/`delta_votes` | int | 레거시 |
| `date_created` | datetime | 작성일 |
| `need_monitoring` | boolean | 모니터링 필요 |
| `date_monitored` | datetime nullable | 모니터링 완료 |

답글은 **`comment_commentreply`**: `id`, `comment_id → comment_projectcomment.id`, `body`, `user_id`, `reply_target_id` (self nullable), `status`, `date_created`, `need_monitoring`, `date_monitored`.

**내부/외부 구분**
- 내부 전용: `management_managenote`
- 프로젝트 페이지 댓글: `comment_projectcomment`, `comment_commentreply`
- 공개/비공개: 댓글 테이블의 `status`
- 내부 노트 필터: `note_type`, `flag`, `is_delete`

---

## 7. 지원 개발사(파트너) 데이터

### 7-1. 지원/입찰: `proposal_proposal`

관계: `project_id → project_project.id`, `partners_id → partners_partners.id`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 지원 ID |
| `project_id` | FK | 지원 대상 프로젝트 |
| `partners_id` | FK | 지원 파트너 |
| `resumes_id` | FK nullable | 기간제 이력서 |
| `ai_proposal_history_id` | FK nullable | AI 지원서 작성 이력 |
| `pre_question_answer` | text | 사전 질문 답변 |
| `status` | varchar(15) | `counselling`, `rejected`, `meeting`, `contracted`, `end_counselling` |
| `stat` | int | 내부 상태 코드 |
| `meeting_failure` | boolean nullable | 미팅 불발 |
| `contract_failure` | boolean nullable | 계약 불발 |
| `failure_reason` | text | 불발 사유 |
| `launch_date` | varchar(16) | 희망 착수일 문자열 |
| `level` | varchar(50) | 주니어/미들/시니어 등 |
| `latest_estimated_budget` | decimal | 제안/희망 금액 |
| `latest_estimated_term` | smallint | 제안/희망 기간 |
| `has_seen_by_client` | boolean | 클라이언트 열람 여부 |
| `date_opened` | datetime nullable | 열람 일시 |
| `will_contract` | boolean nullable | 계약 예정 |
| `is_client_choice` | boolean | 클라이언트 선택 여부 |
| `review_by_gpt` | JSON | GPT 지원자 평가 결과 |
| `action_ids` | varchar(512) | 관리자 액션 ID |
| `date_manager_updated_resumes` | datetime nullable | 매니저 이력서 수정일 |
| `date_created`/`date_modified`/`date_selected` | datetime | 지원일/수정일/선택·미팅 일시 |

지원 시 제출 정보: 제안 금액(`latest_estimated_budget`), 제안 기간(`latest_estimated_term`), 제안 텍스트(`pre_question_answer`), AI 평가(`review_by_gpt`), 상태(`status`/`stat`/`meeting_failure`/`contract_failure`/`failure_reason`).

### 7-2. 파트너 프로필: `partners_partners`

관계: `user_id → auth_user.id`, `proposal_proposal.partners_id → partners_partners.id`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 파트너 ID |
| `user_id` | OneToOne → auth_user.id | 로그인 계정 |
| `job_id` | FK → job.Job | 직종 |
| `job_slug` | varchar(30) | `develop`, `design`, `plan` 등 |
| `job_subcategory` | M:N → job.JobSubcategory | 관심 세부 분야 |
| `description` | text | 자기소개 |
| `strength` | text | 강점 |
| `team_size` | int | 팀 규모 |
| `description_of_team` | text | 팀 소개 |
| `identification` | varchar(12) | `UNAUTHORIZED`, `CERTIFIED`, `AUTHORIZED` |
| `availability` | smallint | 0 가능, 1 조율가능, 2 불가능 |
| `rating`/`term_rating`/`all_rating` | float | 외주/기간제/통합 평점 |
| `project_applied`/`project_accepted`/`project_declined` | int | 지원/수락/거절 수 |
| `portfolio_count` | int | 포트폴리오 수 |
| `skill_slug` | varchar(1024) | 보유 기술 검색용 |
| `portfolio_title_slug` | varchar(2048) | 포트폴리오 제목 검색용 |
| `grade` | varchar(20) | `prime`, `pro`, `boost` |
| `grade_info` | JSON | 등급 정보 |
| `date_created`/`date_modified`/`date_profile_modified` | datetime | |

> 포트폴리오/리뷰/과거 수행 이력은 별도 테이블 추가 조인 필요. 기본 anchor: `partners_partners`, `proposal_proposal`, `agreement_agreement`, `sub_contract_subcontract`.

---

## 8. 개발사 사전 미팅 기록 및 녹취 API

### 8-1. DB 미팅 테이블: `meeting_meeting`

관계: `project_id → project_project.id`, `proposal_id → proposal_proposal.id`, `manager_id`/`manager_tuned_id → auth_user.id`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 미팅 ID |
| `project_id` | FK | 프로젝트 |
| `proposal_id` | FK | 지원서 |
| `manager_id` | FK nullable | 미팅 담당 매니저 |
| `manager_tuned_id` | FK nullable | 조율 완료 매니저 |
| `tune_status` | smallint | 0 조율 안됨, 1 조율 중, 2 조율됨 |
| `tune_count` | int | 조율 제안 횟수 |
| `is_auto_tuning` | boolean | 자동 조율 여부 |
| `date_tuned` | datetime nullable | 조율 완료 일시 |
| `last_modified` | varchar(10) | `client`/`partners` |
| `method` | smallint | 0 위시켓, 1 외부, 2 카카오톡, 3 대면, 4 화상, 5 전화, 8 미팅 없음 등 |
| `method_prefer` | smallint nullable | 선호 미팅 방식 |
| `loc_meeting` | varchar(200) | 미팅 장소 |
| `loc_meeting_url` | varchar(150) | 지도/화상 URL |
| `is_client_office` | boolean | 고객사 사무실 여부 |
| `parking` | JSON | 주차 정보 |
| `date_meeting` | datetime nullable | 확정 미팅 일시 |
| `date_meeting_first_priority` | datetime nullable | 1순위 희망 일시 |
| `date_meeting_second_priority` | datetime nullable | 2순위 희망 일시 |
| `meeting_takes_time` | int | 소요 시간(분) |
| `client_cell_phone_number` | varchar(100) | 클라이언트 연락처 |
| `partner_cell_phone_number` | varchar(100) | 파트너 연락처 |
| `client_memo` | varchar(50) | 클라이언트 → 매니저 요청 |
| `partner_memo` | varchar(50) | 파트너 → 매니저 요청 |
| `client_request` | varchar(50) | 클라이언트 → 파트너 요청 |
| `date_meeting_result` | date | 미팅 결과 안내일 |
| `is_contracted` | boolean nullable | 계약 완료 여부 |
| `is_cancelled` | boolean nullable | 미팅 취소 여부 |
| `meeting_cancel_lock` | boolean | 취소 잠금 |
| `date_cancelled` | datetime nullable | 취소 일시 |
| `cancel_reason` | varchar(50) | 취소 사유 |
| `date_rejected` | datetime nullable | 거절 일시 |
| `calendar_event_id` | varchar(50) | Google Calendar 이벤트 ID |
| `is_multi_milestone_checked` | boolean | 다중 마일스톤 체크 안내 여부 |
| `need_night_noti` | boolean | 야간 알림 필요 |
| `sms_info`/`note`/`meeting_result_data`/`meeting_template_data` | text | 레거시 |
| `meeting_template_id_set` | varchar(50) | 템플릿 ID 목록 |
| `meeting_takes_time_expected` | int nullable | 예상 소요 시간(초) |
| `date_created`/`date_modified` | datetime | |

### 8-2. 프로젝트 ID로 미팅 조회

```sql
SELECT m.id AS meeting_id, m.project_id, m.proposal_id, m.manager_id,
       m.date_meeting, m.method, m.tune_status, m.is_cancelled, m.is_contracted,
       p.partners_id
FROM meeting_meeting m
JOIN proposal_proposal p ON p.id = m.proposal_id
WHERE m.project_id = {project_id}
ORDER BY m.date_meeting DESC, m.date_created DESC;
```

### 8-3. 녹취/통화 기록 API ⭐

```
GET http://192.168.10.217:8000/api/calls/by-phone/?phone={전화번호}&limit=50&offset=0
```

`phone=00000000000&limit=1` 요청은 200 OK 확인됨.

응답 형식:
```json
{
  "phone": "01044580216",
  "member_name": "",
  "total": 7,
  "limit": 50,
  "offset": 0,
  "results": [
    {
      "id": 6203,
      "channel": "phone_mobile",
      "type": "phone",
      "phone": "01044580216",
      "member_name": "상담원명",
      "call_type": "in",
      "call_time_secs": 120,
      "summary": "통화 요약",
      "transcript": "전체 녹취록 텍스트",
      "project_id": 154234,
      "project_title": "프로젝트 제목",
      "user_type": "client",
      "confidence": "high",
      "drive_url": "https://drive.google.com/...",
      "created_at": "2026-04-07 13:55:33"
    }
  ]
}
```

- `transcript`: 이미 STT 변환된 텍스트 녹취록
- `summary`: 통화 요약
- `drive_url`: Google Drive 원본 녹취 파일 링크

**특정 프로젝트 ID 직접 조회 엔드포인트(`/api/calls/by-project/`)는 확인 안 됨.** 현재는 전화번호 기반 조회 → 응답의 `project_id`로 필터링.

페이지네이션: `limit`(기본 50), `offset`. Rate Limit / 인증: 코드상 API Key/JWT 없음. 내부 IP(192.168.10.217) → 사내망/VPN 접근 통제 추정.

---

## 9. 첨부파일 / 문서 저장 구조: `project_projectfile`

관계: `project_id → project_project.id`, `temporary_project_id → submit_temporaryproject.id`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 파일 ID |
| `temporary_project_id` | FK nullable | 임시 프로젝트 |
| `project_id` | FK nullable | 프로젝트 |
| `saved_filename` | varchar(4096) | 서버 저장 파일명 |
| `content` | FileField | S3 저장 파일 객체 |
| `user_uploaded` | boolean | 사용자 직접 업로드 여부 |
| `filename` | varchar(4096) | 원본 파일명 |
| `content_type` | varchar(4096) nullable | MIME 타입 |
| `size` | int nullable | 파일 크기 |
| `date_created` | datetime | 업로드 일시 |
| `open_with_description` | boolean | 상세 페이지 공개 여부 |
| `shorten` | varchar(40) nullable | 단축 URL 코드 |
| `need_share` | boolean | 미팅 시 공유 필요 여부 |
| `date_removed` | datetime nullable | 삭제 일시 |

파일은 `content` FileField(S3 객체)에 저장. 실제 접근 URL은 앱 레벨 S3 signed URL 생성 로직 필요.

---

## 10. 계약 / 정산 / 금액 데이터

### 10-1. 계약 메인: `agreement_agreement`

관계: `project_id`, `client_id`, `partner_id`, `core_manager_id`, `sub_manager_id`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 계약 ID |
| `project_id` | FK nullable | 연결 프로젝트 |
| `client_id` | FK nullable | 클라이언트 |
| `partner_id` | FK nullable | 파트너 |
| `core_manager_id`/`sub_manager_id` | FK nullable | 담당 매니저 1/2 |
| `process_id` | FK nullable | 내부 프로세스 |
| `title` | varchar(150) | 계약 제목 |
| `agreement_price` | bigint | 계약 금액 (SubContract 합계) |
| `fee_percentage` | float | 수수료율 |
| `contract_type` | varchar(50) | 삼자/양자/상주/위임 등 |
| `status` | int | 0 체결중, 1 진행중, 2 종료, 3 분쟁 |
| `hide` | boolean | 숨김 |
| `initial_milestones` | text | 최초 마일스톤 JSON |
| `due_date` | date nullable | 내부 듀데이트 |
| `date_created`/`date_modified` | datetime | |
| `date_start_progress` | date nullable | 진행 전환일 |
| `date_deleted` | datetime nullable | 삭제일 |
| `date_completed` | datetime nullable | 완료일 |

### 10-2. 계약/특약 상세: `sub_contract_subcontract`

하나의 agreement에 여러 subcontract(원계약 + 특약 + 해지 특약).

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 계약/특약 ID |
| `agreement_id` | FK → agreement_agreement.id | 상위 계약 |
| `is_incomplete_addon` | boolean | 체결 안 된 특약 |
| `is_cancel_addon` | boolean | 해지 특약 |
| `is_not_conclusion_document` | boolean | 외부 계약서 체결 |
| `client_fee_percentage`/`partner_fee_percentage` | float | 수수료율 |
| `date_contracted` | date | 계약 체결일 |
| `project_start_date` | datetime nullable | 착수일 |
| `total_price` | bigint | 계약 금액 |
| `work_scope` | text | 업무 범위 |
| `work_detail` | text nullable | 업무 상세 |
| `work_location` | text nullable | 근무 조건 |
| `repair_term` | int nullable | 하자보수 기간 |
| `survey_result_number` | text nullable | 선택조항 JSON |
| `survey_result_text` | text nullable | 선택조항 텍스트 |
| `ip_rights` | int | 지식재산권 조항 |
| `repair_condition` | int | 하자보수 범위 |
| `maintenance_condition` | int | 유지보수 범위 |
| `escrow_service` | boolean | 에스크로 사용 |
| `date_created`/`date_modified` | datetime | |

### 10-3. 정산/차수: `milestone_milestone`

관계: `contract_id → sub_contract_subcontract.id`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | PK | 마일스톤 ID |
| `contract_id` | FK nullable → sub_contract_subcontract.id | 계약/특약 |
| `legacy_contract_id` | FK nullable | 구 계약 |
| `milestone_type` | varchar(30) | `tripartite`, `bipartite`, `charge` |
| `title` | varchar(60) | 차수명 |
| `price` | int | 차수 공급가액 |
| `work_period`/`tally_period` | int nullable | 업무/검수 기간 |
| `contract_date_*` | date nullable | 계약상 예정일 (payment/start/tally/end/withdraw/charge) |
| `manage_date_*` | date nullable | 관리자 조정 예정일 |
| `date_client_payment`/`date_start`/`date_tally`/`date_end` | date nullable | 실제 결제/시작/검수/완료일 |
| `approve_of_withdraw` | boolean | 지급 승인 |
| `tally_condition` | varchar(1000) | 검수/지급 조건 |
| `management_status` | varchar(45) | 빌링 관리 상태 |
| `memo` | text nullable | 매니저 메모 |
| `date_created`/`date_modified` | datetime | |

**과업 범위 변경/예산 증액 이력 추적**: 특약(`sub_contract_subcontract`), 해지 특약(`is_cancel_addon=1`), 미체결 특약 제외(`is_incomplete_addon=0`), 업무 범위(`work_scope`/`work_detail`), 금액 변경(`total_price`), 정산 차수(`milestone_milestone`).

---

## 11. 데이터 변경 추적

### created/updated 계열

| 테이블 | 생성 | 수정 |
|---|---|---|
| `project_project` | date_created | date_modified |
| `project_projectinitialvalue` | date_created | date_modified |
| `detail_projectdetail` | 없음 | 없음 |
| `proposal_proposal` | date_created | date_modified |
| `meeting_meeting` | date_created | date_modified |
| `management_managenote` | date_created | 없음 |
| `project_projectfile` | date_created | 없음 (삭제는 date_removed) |
| `agreement_agreement` | date_created | date_modified |
| `sub_contract_subcontract` | date_created | date_modified |
| `milestone_milestone` | date_created | date_modified |
| `client_client` | date_created | date_modified |
| `partners_partners` | date_created | date_modified |

### Audit Log / 변경 이력

범용 Audit Log 테이블 **없음**. 조합 필요:
- 프로젝트/계약 카드 코멘트/히스토리: `management_managenote`
- 레거시 프로젝트 변경 이력: `projecthistory_projecthistory`
- 계약/특약 변경: `sub_contract_subcontract`, `milestone_milestone`
- 댓글/문의 변경: `comment_projectcomment`, `comment_commentreply`

### 상태 변경 웹훅 / 이벤트 큐

전용 테이블 **확인 안 됨**. CaseLab 연동 현실적 방식:
1. **Read replica polling** — `date_modified`, `date_created`, `date_cancelled`, `date_rejected`, `date_start_recruitment` 기준 증분 동기화
2. **프로젝트별 히스토리 조인** — `management_managenote.date_created`, `projecthistory_projecthistory.created_at`
3. 필요 시 본진에 outbox/event table 추가 요청

---

## 12. API 접근 방식 및 데이터 규모

### 접근 방식

| 대상 | 접근 방식 |
|---|---|
| 본진 DB 데이터 | wishket-db MCP / read replica |
| 통화/녹취 데이터 | 내부 HTTP API `http://192.168.10.217:8000/api/calls/by-phone/` |
| 파일 원본 | `project_projectfile.content` S3 FileField (앱 레벨 URL 생성 필요) |
| 녹취 원본 | 통화 API 응답의 `drive_url` |

### 인증

| 대상 | 확인 내용 |
|---|---|
| wishket-db MCP | Hermes 내부 MCP로 read-only SELECT 접근 |
| 통화 API | 코드상 API Key/JWT 없음. 내부망/VPN 기반 추정 |
| 본진 외부 API | **확인 필요** |

### 데이터 규모 (read replica 확인)

```text
총 project_project rows: 124,517건
최초 생성일: 2013-10-03 00:02:22
최근 생성일: 2026-07-09 02:15:50
```

12만 건 이상 규모.

### Rate Limit / 조회 제한

| 대상 | 확인 내용 |
|---|---|
| wishket-db MCP | SELECT only, max_rows 제한 있음. 대량 조회는 페이지네이션/증분 필요 |
| 통화 API | limit/offset 있음. Rate Limit 확인 안 됨 |
| Slack/기타 | Hermes Slack gateway는 임의 채널 검색 API 없음 |

---

## 13. CaseLab 권장 Read Model

### `caselab_project_snapshot`
원천: `project_project`, `project_projectinitialvalue`, `detail_projectdetail`, `client_client`, `client_clientinfo`
키: `project_id`, `client_id`, `inspection_manager_id`, `management_manager_one_id`, `management_manager_two_id`, `status`, `is_cancelled`, `is_rejected`, `date_modified`

### `caselab_project_timeline`
원천: `management_managenote`, `projecthistory_projecthistory`, `meeting_meeting`, `proposal_proposal`, `agreement_agreement`, `sub_contract_subcontract`, `milestone_milestone`, `comment_projectcomment`, `comment_commentreply`
정렬 키: `event_at = date_created / created_at / date_meeting / date_contracted / date_modified`

### `caselab_manager_visibility`
"검수했던 매니저가 이후에도 추적"하려면 아래 조건으로 project access list 생성:
```text
project.inspection_manager_id, project.management_manager_one_id, project.management_manager_two_id
meeting.manager_id, meeting.manager_tuned_id
agreement.core_manager_id, agreement.sub_manager_id
management_managenote.created_by_id, management_managenote.action_by_id
projecthistory_projecthistory.manager_id
```
즉 "현재 담당자"뿐 아니라 **한 번이라도 관여한 매니저**를 프로젝트별로 역정규화해 두는 구조가 좋음.
