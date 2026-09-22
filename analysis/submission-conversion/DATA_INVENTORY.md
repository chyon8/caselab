# 제출→모집 분석: 데이터 인벤토리와 확보 요청서

작성 기준: 2026-09-22. 이 문서는 **저장소에서 확인한 사실**, **CaseLab live 조회**, **사용자 진술**, **추가 확인할 후보**를 구분한다. 본진 DB의 현재 스키마·값·건수는 직접 조회하지 않았다. `DATA_SCHEMA.md`가 과거 live 조사에 기반한다는 것과 지금 본진 live 확인됐다는 것은 다르다. 기업 규모 수집 시작은 사용자가 **2026-09-03**으로 확인했고, 새 스키마는 제공 예정이다. 개발자·의사결정·예산 확보·일정 자료는 사용자가 **다른 DB에 있을 것으로 보고 별도 스키마를 추출해 제공하기로 했다**. 아직 테이블·컬럼·원자료 존재가 확인된 것은 아니다. 사용자 지시에 따라 **1시간 내 연락 효과·영업시간 기준 분석은 이번 범위에서 제외**한다.

## 1. 표 읽는 법과 공통 수집 규칙

- 근거 `D`: [DATA_SCHEMA.md](../../DATA_SCHEMA.md)에 테이블·필드가 기재됨. `C`: 현재 저장소 SQL/매핑/마이그레이션에 구현됨. `U`: 사용자 진술. `X`: 외부 자료 또는 새 스키마 탐색 후보. `L`: 이번 작업의 실제 live 조회로 검증됨. **L은 아래 CaseLab(Neon) 실측에만 해당하며 본진 검증이 아니다.**
- CaseLab `수집`: 로컬 SQL과 매핑에서 수집 경로 확인. 현재 실데이터의 적재 성공·누락률까지 보증하지 않는다. `부분`: 모집 전환 표본만 있거나 필요한 하위 항목만 수집. `미수집`: 현재 SQL/스키마에 해당 수집 경로 없음. `미확인`: 저장 경로 또는 실행 여부를 아직 찾지 못함.
- 우선순위 `required`: 전체 비교를 성립시키는 분모·결과·시간·식별/검증 자료. `core`: 이번 질문의 주요 설명변수 또는 이유 분석. 확보 실패 시 해당 분석을 미실시로 명시한다. `enrich`: 추가 가설·교란 점검·후속 실험을 풍부하게 하는 자료. **core/enrich가 없다는 이유로 required가 갖춰진 전체 분석을 중단하지 않는다.**
- 각 행의 기간은 **자료가 실제 수집되기 시작한 기간**과 **관측한 사실이 언제의 상태인지**를 뜻한다. 별도 표시가 없으면 실제 최초·최종 관측일/월별 충족률은 미확인이다. `C`의 프로젝트 수집 범위는 `date_start_recruitment >= 2024-11-11`인 외주 중 현재 상태가 모집/모집마감/계약/완료인 행이다. 제출일 기준 전체 표본과 다르다.
- 분류 저장 형식·결측 enum의 유일 기준은 [CODEBOOK.md §2](./CODEBOOK.md#2-공통-저장-형식과-결측-의미)다. 각 관측에 `known_at`, `reported_valid_at`, `measured_at`, `value_status`, `evidence`, `codebook_version`을 기록한다. `known_at`은 최초 기록 시각, `reported_valid_at`은 사실이 가리키는 시점이며 대체하지 않는다. 원천 시간이 없으면 만들어 넣지 않고 `time_unverified`로 표시한다. 수집 시작일·폼 버전은 별도 출처 등록부에 둔다.
- 상태는 `observed`, `explicit_none`, `not_answered`, `not_recorded`, `not_collected`, `unavailable`, `time_unverified`, `conflict`, `not_applicable`만 사용한다. 조건부 문항 미노출은 실제 적용대상이 아니면 `not_applicable`, 해당 경로가 미수집이면 `not_collected`다. 원문 미확보/판독 불가는 `unavailable`와 상세 원인으로 기록한다. 결측 원인을 구별할 근거가 없으면 CODEBOOK의 `not_recorded` 규칙을 따른다. **NULL이나 빈 문자열을 '없음/준비 안 됨'으로 바꾸지 않는다.**
- 기업 규모·내부 개발자·의사결정 정보는 값 유무뿐 아니라 질문 문구, 보기, 필수/선택 여부, 적용 화면/유입경로, 출시일, 백필 여부, 수정 가능 여부가 있어야 비교 가능하다.

### CaseLab 현재 값 실측 [L: 2026-09-22, 팀의 read-only Neon 조회]

모집 이후 표본 중 `submitted_at`이 KST **2026-01-01 이상, 2026-09-01 미만**인 프로젝트를 조회했다. 다음 값은 본진 전체 제출 건수나 최신 전체 CaseLab 건수가 아니다.

| 항목 | 건수 | 이 표본 안 비율 | 해석 |
|---|---:|---:|---|
| 조회 프로젝트 | 1,931 | 100% | 제출 기준 1~8월의 **CaseLab 수집 표본** |
| `recruit_started_at` 존재 | 1,931 | 100% | 미전환 비교군 없음 |
| `initial_budget > 0` | 484 | 25.1% | 나머지 1,447건은 초기 예산 양수 관측 없음. 원천 미수집·0 변환·무응답 중 무엇인지 미확인 |
| `initial_term_days > 0` | 607 | 31.4% | 나머지 1,324건은 초기 기간 양수 관측 없음 |
| 비어 있지 않은 `posting_raw` | 1,931 | 100% | **현재 공고문**이며 제출 원문 100% 확보라는 뜻 아님 |
| 비어 있지 않은 `planning_status` | 0 | 0% | 수집 경로 존재와 usable 값 존재가 다름 |
| 숨김 또는 삭제 | 0 | 0% | 본진에 삭제/숨김 제출이 없다는 뜻 아님 |

초기 예산·기간의 complete-case만 비교하면 선택편향 위험이 크다. 본진 양 집단의 원천 0/NULL·최초 기록 시기·폼 기본값을 월별로 프로파일링하고, 누락 자체를 공개한다. 현재 예산·기간으로 보간하지 않는다.

## 2. 전체 제출 분모·결과·시간

| ID / 우선순위 | 필요한 정보와 용도 | 정확한 원천 / 확인 수준 | CaseLab 현재 | 기간·제출시점 적합성 / 누락 처리 |
|---|---|---|---|---|
| G01 required | 프로젝트 키, 외주/기간제 구분 | `project_project.id`, `project_project.project_type` [D,C] | `projects.id` 수집; SQL은 외주만 선택 | 전체 제출 행을 본진에서 다시 추출. ID는 문자열로 보존. 기간제는 분리; 임의 합산 금지 |
| G02 required | 실제 제출 시각, 생성/수정 시각 | `project_project.date_submitted`, `date_created`, `date_modified` [D]; 제출/수정 수집 [C] | `projects.submitted_at`, `source_modified_at` 수집; 최초 생성일 미수집 | 생성일을 제출일로 대신 쓰지 않음. 제출일 없는데 처리 이력 있는 행은 별도 오류 목록; UTC 원본·KST 집계 경계 보존 |
| G03 required | 모집 도달 시각 및 현재 상태 | `project_project.date_start_recruitment`, `status` [D,C] | `projects.recruit_started_at`, 가공 `status` 수집 | 현재 모집중인 것뿐 아니라 이후 취소/계약도 모집 도달로 평가. 날짜 덮어쓰기·재모집 여부 확인 |
| G04 required | 검수 거절/고객 취소, 발생시각 | `project_project.is_rejected`, `date_rejected`, `is_cancelled`, `date_cancelled` [D,C] | 날짜 수집; 플래그는 가공 상태에 합쳐짐 | 원천 플래그·날짜를 따로 확보. 취소와 거절 동시 발생, 날짜 없는 플래그, 모집 이전/이후를 구분; 모순 자동 분류 금지 |
| G05 required | 삭제·숨김 및 사유, 표본 제외 근거 | `project_project.date_deleted`, `management_hide`, `hide_from_list`, `is_private` [D]; 앞 2개 [C]. 삭제 사유 필드 미확인 [X] | `projects.deleted_at`, `hidden` 수집 | 숨김/소프트삭제만으로 분모 제외하지 않음. hard delete·운영 내부테스트 제외 가능 범위와 근거 확인 |
| G06 required | 재제출·복제·분할·동일 의뢰 연결 | `project_project.previous_project_id`, `date_user_reedit` [D]; `projecthistory_projecthistory.project_id`, `raw_data`, `created_at` [D: 문서 자체가 재확인 요구] | 미수집 | FK의 실제 의미, 최초/최근 제출일 덮어쓰기 여부 확인. 이력이 없으면 프로젝트 단위임을 명시하고 최초 고객 제출 보조집계; 중복을 제목만으로 삭제 금지 |
| G07 required | 고정 추출 기준시각, DB/타임존/복제 지연, 페이지 완전성 | 분석 실행 메타데이터 [새 산출물]; 본진 저장 UTC는 `n8n/projects_incremental.sql` [C] | `synced_at`은 CaseLab 수신시간일 뿐 | 실행 시각·SQL 버전·DB 스냅샷/워터마크·페이지 키·총건수/고유 ID 수 기록. 서로 다른 날 추출한 결과 혼합을 탐지 |
| G08 required | 제출·모집·거절 이벤트 코드의 운영상 의미와 변경일 | 상태 코드 목록 [D]; 정확한 운영 정의/개정일/자동 전환 예외 [X] | 가공 상태만으로 복구 불가 | 관리자가 실제 사례와 대조. `submitted`라는 현재 상태만을 전체 제출 분모로 삼지 않음 |
| G09 core | 담당 매니저·배정 변경·처리 환경 | `project_project.inspection_manager_id`, `management_manager_one_id`, `management_manager_two_id` [D]; 배정 history 전용 테이블은 문서 미확인 | `projects.inspection_manager`만 현재 표시명 수집 | 현재 담당자는 제출 당시 담당자 아닐 수 있음. 최초 배정/이관 시각은 history·CRM 후보; 개인 평가용이 아니라 처리 차이 점검 |
| G10 enrich | 정책·등록 화면·마케팅/검수 운영 변경 구간 | 배포 기록·운영 공지·폼 버전·CRM 규칙 [X] | 미수집 | 이미 확보된 정책 변경만 보조 기록. 운영 기준 추가 질의·1시간 연락 정책 분석은 이번 제외; 확인 못 한 정책 차이는 해석 한계로 남김 |

## 3. 클라이언트·기업·과거 경험

| ID / 우선순위 | 필요한 정보와 용도 | 정확한 원천 / 확인 수준 | CaseLab 현재 | 기간·제출시점 적합성 / 누락 처리 |
|---|---|---|---|---|
| C01 required | 동일 고객의 과거 이력 계산용 연결 | `project_project.client_id` → `client_client.id`, `client_client.user_id` [D] | **의도적으로 미수집** [C] | `client_id`는 본진 안에서 조인/집계만. 추출은 프로젝트별 과거 건수·첫 제출 여부 등 파생값만. 반복고객 군집 계산도 본진/내부 환경에서 수행; 원 ID/해시 ID를 외부 파일로 내보내지 않음 |
| C02 core | 개인/팀/개인사업자/법인 형태 | `client_clientinfo.project_id`, `form_of_business`, `date_created` [D] | 미수집 | 프로젝트별 다중행·수정 정책 확인. 기업 형태는 기업 규모 아님. 개인=회사명 공란을 자동 확정하지 않음 |
| C03 core | 회사명·회사 소개·사이트의 실제 존재/기입 | `client_clientinfo.company_name`, `company_intro`, `date_created`; `client_client.company_name`, `company_description`, `website`, `date_modified` [D]; 회사명 [C] | `projects.client_name`만 수집 | 고객 프로필 최신값을 과거 상태로 사용하지 않음. 회사명은 업종/규모 추정 근거가 아니며 표본 연결 키로 사용 금지. 회사명이 개인 실명일 수 있어 불필요한 원문은 내보내지 않음 |
| C04 core | **기업 규모**: 무엇을 규모로 묻는지부터 확인 | 기존 스키마에 고객사 인원·매출·규모 구분 필드 없음. **2026-09-03 수집 시작** [U, 사용자 확인]. 실제 스키마 사용자 제공 예정 [X] | 미수집 경로로 판단; 신설 컬럼 live 미확인 | 출시일은 확인됨. 질문·보기·노출대상·수정/백필·현재 스키마는 확인 필요. 1~8월 `not_collected`; 9/3 이후 동일 폼 버전·14일 관찰 성숙분만 비교. 현재 규모로 과거 보간 금지. `partners_partners.team_size`는 개발사 규모라 사용 불가 |
| C05 core | **고객사 업종**과 사업모델 | 전용 업종 필드 문서에 없음. `company_intro`/`company_description` 자유서술 [D], 최근 입력 폼/CRM/기업 정보 [X] | 업종 미수집 | 프로젝트 분야와 발주사 업종을 분리. 외부 기업DB 조인 시 식별 정확도·기준일·커버리지 확인; 소개문 분류면 원문 근거와 검증 라벨 보존 |
| C06 core | 신규/재이용: 이번 제출 이전 제출·모집·거절/취소 건수 | 과거 `project_project.client_id`, `date_submitted`, `date_start_recruitment`, `date_cancelled`, `date_rejected` [D]에서 파생 | 미수집 | 반드시 각 사건시각 `< 이번 제출시각`. 2026년 표본만으로 이력 계산 금지; 확보 가능한 과거 전체를 조회하고 lookback 명시. 동시 제출은 이전으로 세지 않음 |
| C07 core | 과거 **유효 계약** 경험·최근성·규모 | `agreement_agreement.client_id`, `project_id`, `hide`, `date_deleted`; `sub_contract_subcontract.agreement_id`, `date_contracted`, `is_incomplete_addon`, `is_cancel_addon`, `total_price` [D] | 고객 단위 과거 이력 없음 | 이번 제출 이전 체결만. `client_client.project_created/project_arranged/project_canceled` 현재 누적값은 미래 누출로 금지. 과거 계약이 현재 삭제/숨김이면 역사 복원 한계 기록 |
| C08 enrich | 가입 후 첫 제출까지 시간, 플랫폼 이용 기간 | `client_client.date_created` [D] | 미수집 | 가입일 의미 확인; 계정 이전/병합 시 불확실성 표시. `date_modified` 사용 금지 |
| C09 core | 외주 발주/관리 경험(타 플랫폼 포함) | `detail_projectdetail.has_manage_experience`, `project_project.has_manage_experience` [D] | 미수집 | 두 필드의 실제 우선순위·기입 단계 확인. 플랫폼 이력 C06/C07과 별도. 비어 있으면 경험 없음 아님 |
| C10 enrich | 담당자 역할·결정권·실제 발주주체/대행사 | 역할·결정권 전용 필드 미확인 [X]. `project_project.zpzg` 인터뷰 JSON [D], CRM/설문/검수통화 후보 | 미수집 | `client_clientinfo.full_name`, `representative`나 담당자 수로 결정권 추정 금지. 프로젝트 `role`은 고객 직책이라는 근거 없음 |
| C11 enrich | 회사의 사업 단계·운영 중 서비스·매출/사용자 보유 | 전용 필드 미확인 [X]; 초기 원문/별도 설문/CRM 후보 | 미수집 | 고객 회사의 사업 단계와 프로젝트의 개발 단계를 분리. 현재 웹사이트 조사 결과는 제출시점 지표가 아님 |
| C12 enrich | 계정과 회사의 단위 차이 | 회사 식별/계정 병합 테이블 문서 미확인 [X] | 미수집 | 동일 법인의 여러 계정 가능. 회사명 문자열로 계정을 강제 합치지 않고 고객 단위는 계정 기준임을 명시; 내부 검증 매핑 있으면 내부에서만 사용 |

## 4. 프로젝트 내용: 무엇을 하려는가

이 표는 **내용의 종류·목적·제약**이다. 다음 절의 **추진 조건/정보의 명확성**과 분리한다. 원문이 짧아도 내용 유형은 확인될 수 있고, 원문이 길어도 예산 승인·의사결정은 미확정일 수 있다.

| ID / 우선순위 | 필요한 정보와 용도 | 정확한 원천 / 확인 수준 | CaseLab 현재 | 기간·제출시점 적합성 / 누락 처리 |
|---|---|---|---|---|
| P01 core | 제출 원문 및 원본 스냅샷 시각 | `project_projectinitialvalue.project_id`, `description`, `budget`, `term`, `date_created`, `date_modified` [D] | `initial_budget`, `initial_term_days`만; **initial description 미수집** [C] | 제출 당시 불변 스냅샷인지 생성/갱신 로직 확인. 원본 없으면 최신 공고문으로 대체하여 초기 특성 분석하지 않음. 누락률을 결과집단/월별로 공개 |
| P02 core | 제목/현재 공고문, 검수 전후 변화 | `project_project.title`, `description`, `date_modified` [D,C]; 제목 초기 스냅샷 필드는 문서 없음 | `projects.title`, `posting_raw` 수집 | 최신 공고문은 검수/모집 이후 변화 포함. 초기 분석은 P01, 현재 공고문은 검수 개입·변화 분석에만 사용; 제목 시간도 미확인 표기 |
| P03 core | 신규 제작/기존 개선/유지보수 | `detail_projectdetail.project_purpose` (`new`,`renewal`,`maintenance`) [D]; P01 원문 | 전용 필드 미수집 | `renewal` 등 정의 및 선택 시점 확인. 원문 세부 태그(버그 수정/기능 추가/마이그레이션/설치·설정 등)는 별도로 보존; 넓은 카테고리로 뭉개지 않음 |
| P04 core | 작업 범위: 개발/디자인/기획·일괄발주 | `project_project_categories.project_id`, `jobcategory_id` → `job_jobcategory.id`, `title_kor`, `seq_num` [C]; `project_project.is_turnkey` [D,C] | `projects.dev_scope`, `is_turnkey` 수집 | M:N 한 프로젝트 여러 범위 보존, 행 수 증식 금지. 현재 범위면 초기 원문과 분리. 설계 시점의 schema 목록과 live명 대조 필요 |
| P05 core | 분야/채널: 웹/모바일/쇼핑몰 등 | `project_field_projectfieldsubcategory.project_id`, `field_subcategory_id`, `is_represent`, `date_created`; `project_field_fieldsubcategory.id`, `name`, `category_id` [D,C] | 대표 1개 `projects.category`만 | 분야 복수선택 보존. 정규 `platform_type` 단일 컬럼은 문서상 없음. 분야는 검색/층화 정보이며 원인 설명을 대신하지 않음 |
| P06 core | 사용 목적·대상: 내부업무/고객서비스/판매/운영 자동화 등 | 정규 컬럼 미확인; P01 등록 원문에서 근거 문장으로 분류 [X] | 최신 원문만 있어 초기 분류는 추가 필요 | 고객 업종과 분리. 하나의 원문에 여러 목적 가능. 텍스트에 없으면 추론하지 않음; 코딩북 버전·증거 위치 보존 |
| P07 core | 구체 작업/납품물: 구축·설정·통합·수정·이전·자문·견적 확인 | `project_project.submit_purpose` 이름만 [D: enum/의미 미확인]; P01 원문 [D] | 미수집 | 단순 견적 문의/탐색, 실제 발주 목적은 명시 근거로 분리. 짧은 글/첨부 없음만으로 테스트로 분류 금지 |
| P08 core | 기존 시스템·제품·코드·데이터의 존재와 변경 대상 | 정규 필드 미확인; P01 원문/초기 파일/CRM [X] | 미수집 | 기존 서비스 운영·기존 시스템 존재·소스 접근 가능은 서로 다름. 서비스 URL만으로 소유/접근 권한 추정 금지 |
| P09 core | 기술/연동/특정 제품 의존 | `project_project.skills_slug`, `project_keywords`; `tags_projectskilltag.object_id`, `tag_id`, `date_created` [D]; P01 원문 | `projects.tech` 수집; 초기 태그/키워드 미수집 | 최신 기술 태그는 검수 후 추가될 수 있음. 특정 SaaS 설치/설정과 신규 시스템 개발을 구분; AI 사용이라는 단어만으로 신규 AI 개발로 분류하지 않음 |
| P10 enrich | 제한조건: 레거시, 하드웨어, 보안/인증, 소스 인수, 상주/지역 | P01 원문; `detail_projectdetail.qualification`, `pre_meeting_method`, `progress_meeting_method`, `progress_meeting_location`, `progress_meeting_frequency` [D]; `project_project.location_sido_id`, `location_sigungu_id` [D] | 최신 본문 일부에만 존재 | 기술적 난이도와 공급자 제한을 구분. 특정 태그 부재=제약 없음 아님. 주소/개인 위치는 내보내지 않고 필요한 시도 수준만 |
| P11 enrich | 특수 사업·공공/지원사업·일괄발주/운영 상품 | `detail_projectdetail.is_supporting_project`, `supporting_project`; `project_project.is_aid_project`, `is_inhouse`, `wishket_package_json`, `premium_service_status` [D: 일부 이름만] | `is_turnkey` 외 미수집 | raw 값과 의미를 확인한 후 매핑. `is_inhouse`를 내부개발자 보유로 해석 금지. 정책/상품이 만든 모집 전환 차이 점검 |

## 5. 추진 준비도: 관측 가능한 축과 근거

**종합 준비도 점수는 만들지 않는다.** 자료 명확성, 실행 조건, 예산, 일정, 결정 구조를 각각 관측한다. 파일 수/글자 수는 표현 방식 지표일 뿐 고객의 실행 준비도나 가치의 점수가 아니다. 모든 수동/AI 추출에 원문 근거와 관측 시점을 붙이고, 결과를 안 뒤 해석한 문장을 초기 특성으로 쓰지 않는다.

| ID / 우선순위 | 필요한 정보와 용도 | 정확한 원천 / 확인 수준 | CaseLab 현재 | 기간·제출시점 적합성 / 누락 처리 |
|---|---|---|---|---|
| R01 core | 초기 예산, 예산 범위·유연성·정해졌는지 | `project_projectinitialvalue.budget` [D,C]; `detail_projectdetail.budget_option`, `priority` [D] | `initial_budget`; 현재 `budget` 수집 | 0 초기값은 현재 매핑에서 NULL화함. 원천 0과 명시적 무료/미정/협의는 구분, 실제 코드 의미 검증. 예산 기입은 자금 확보와 다름 |
| R02 core | 자금 확보/승인/조건부 지원금 여부 | `detail_projectdetail.is_support_cost`, `is_supporting_project`, `supporting_project` [D]; 일반 예산 승인 단계는 미확인 [X] | 미수집 | `is_support_cost`는 문서상 사업비 확정이나 모든 프로젝트 질문인지 지원사업 조건부인지 확인. 이를 일반 예산 승인으로 확장 금지. 지원금 신청/선정/입금은 따로 |
| R03 core | 예상 작업 기간, 희망 착수일, 최종 착수 가능일 | `project_projectinitialvalue.term`; `detail_projectdetail.launch_date`, `max_launch_date`, `launch_date_option`, `term_option`; `project_project.date_expected_kick_off`, `term_type` [D] | `initial_term_days`, 현재 `term_days` 수집 | `term`은 현재 매핑상 항상 일수; `term_type='month'`로 30을 다시 곱하지 않음. `date_deadline`은 모집 마감일이므로 납품 데드라인으로 사용 금지 |
| R04 core | 납품 고정기한·왜 고정인지·지연 가능성 | 전용 명확한 필드 미확인; P01/설문/CRM/초기 통화 [X] | 미수집 | 착수일과 최종 완료기한 분리. '급해요'만으로 날짜 확정 처리 금지. 정책 시행 후에만 질문했다면 그 이전은 미수집 |
| R05 core | 내부 담당 인력 존재·역할 | `detail_projectdetail.inside_manpower`, `detail_inside_manpower` [D] | 미수집 | **내부 인력 있음 ≠ 내부 개발자 있음**. 기획/PM/디자인/개발/운영 구분은 원문 명시 시만. 현재 detail에 시간컬럼 없어 제출시점 불확실 |
| R06 core | 내부 개발자/기술 의사결정자 유무·투입 가능성 | 전용 구조화 필드 미확인; R05 상세, `project_project.zpzg` 키 미확인, 사용자 제공 자료/CRM [X] | 미수집 | 재직 여부, 프로젝트 지원 가능 여부, 소스 검토 가능 여부를 분리. 외부 개발사와 혼동 금지; 담당자 이름 불필요 |
| R07 core | 발주 결정권·승인 단계·최종 승인 예정일 | 전용 구조화 필드 미확인; `project_project.zpzg`/초기 통화/CRM/사용자 자료 [X] | 미수집 | `decision_role`, `approval_state`, `approval_due`의 원천 정의 필요. 연락 담당자=결정권자로 간주 금지; 거절 후 회고 설명은 사후 근거로만 |
| R08 core | 담당 PM/책임자·응답/검수 가능 시간·의사결정 구조 | `detail_projectdetail.inside_manpower`는 부분 후보 [D]; 담당 체계/합의 인원/검수 주체는 미확인 [X] | 미수집 | 복수 연락처 `client_clientworker` 개수로 구조 추정 금지. 원천에 '없음'이라고 적혀 있을 때만 없음; 이름·전화·메일은 제외 |
| R09 core | 기획 상태 자기보고와 실제 보유 자료 종류 | `project_project.planning_status` [D,C]; `detail_projectdetail.plan_status`, `detail_plan_status`, `document_share` [D] | `projects.planning_status`만 수집 | 두 plan 필드의 차이·갱신 시점/메뉴 기본값 확인. `document` 선택 ≠ 첨부가 검증됨. 자료 비공개/미팅 후 공유를 자료 없음과 분리 |
| R10 core | 목적·대상·현재 문제·범위·필수 기능·납품물의 명확성 | P01 초기 원문에서 별도 코딩; 현 `SCORING_SPEC.md`의 점수는 검수용이며 분석 유효성 미검증 [C] | 현 검수 `review_session.analysis`는 표본/시점이 다른 보조자료 | `명시/부분 명시/미기재/해당없음`으로 차원별 평가. 글자 수나 현재 스코어 60점으로 이분화 금지. 추출 정확도는 별도 사람 검증 |
| R11 core | 원문 정보량·양식/작성 주체 | `project_projectinitialvalue.description` [D]; 폼 버전/매니저 대필/자동 생성 여부 전용 필드 미확인 [X] | 초기 원문 미수집 | HTML·템플릿 안내·빈 양식·중복 문장 제거 전/후 길이 모두 보관. 긴 글=고준비도 아님. 양식 변경으로 길이 달라질 수 있음 |
| R12 core | **제출 당시** 첨부 존재·개수·종류·용량 | `project_projectfile.id`, `project_id`, `temporary_project_id`, `user_uploaded`, `content_type`, `size`, `date_created`, `date_removed` [D] | 정기 수집 없음; 화면의 파일업로드 기능과 본진 파일 적재는 별개 | `date_created <= 제출시각`이고 제출시각에 삭제되지 않은 파일만 초기 첨부. 임시 프로젝트→본 프로젝트 연결·삭제 보존 검증; 행 없음=파일 없음은 완전 조회일 때만 |
| R13 core | 첨부의 실질 내용/기획자료 적합성 | `project_projectfile.content`, `filename`, `saved_filename`, `open_with_description`, `need_share` [D]; S3 접근 URL 생성은 별도 | 미수집 | 회사 소개/로고/참고 이미지/기획안/요구사항/화면설계/코드/기타 구분. 확장자/파일명만으로 기획서 확정 금지. 파일 접근불가·암호화·OCR 실패는 `unavailable`에 상세 원인을 기록하며 무첨부 아님 |
| R14 enrich | 기존 소스/서버/계정/데이터의 접근권한·인수인계 준비 | 초기 원문·초기 첨부·CRM/통화 후보; 구조화 필드 미확인 [X] | 미수집 | 권한 있음/확보 예정/분쟁·부재/미확인. 계정 비밀번호나 키 수집 금지. 기존 시스템 존재 P08과 분리 |
| R15 enrich | 발주 동기·비교견적 단계·타 업체 진행·견적만 확인 | `project_project.submit_purpose` [D: 값 의미 미확인]; 초기 원문/CRM [X] | 미수집 | 취소 후 '타 업체 선택' 사유는 초기 비교 여부 지표로 역추정 불가. 가격만 확인과 실수/테스트를 구분 |
| R16 enrich | 실행 의존조건: 투자/지원금/내부 승인/행사/고객 확보 | 초기 원문·CRM·설문; 일부 R02/R04/R07 후보 [X] | 미수집 | 외부 조건 종류와 확정 상태를 분리. 결과를 알고서 실패 이유를 준비도에 재주입하지 않음 |

## 6. 검수 처리·연락·거절 사유

| ID / 우선순위 | 필요한 정보와 용도 | 정확한 원천 / 확인 수준 | CaseLab 현재 | 기간·제출시점 적합성 / 누락 처리 |
|---|---|---|---|---|
| O01 core | 원천 거절/취소 코드와 자유서술 이유 | `project_project.cancel_type`, `management_cancel_reason`; `is_cancelled/is_rejected` 및 각각 날짜 [D] | `projects.cancel_reason` 수신 자리만 있음. 현재 n8n SQL은 사유 미전송 [C] | enum별 라벨·어느 행에서/언제 쓰는지·덮어쓰기 확인. '기타' 선택과 그 안의 테스트/실수 이유를 분리. 빈 값은 이유 미상 |
| O02 core | 사유 보완용 검수 노트와 근거시각 | `management_managenote.project_id`, `note_type`, `flag`, `body`, `detail_option`, `date_created`, `date_action`, `is_delete` [D]; `id` [C] | 모집 표본에서 `memo` 일부+`review_memo`만 `timeline_events` 수집 | 결과 설명에는 사후노트 사용 가능하나 제출 특성에는 불가. 삭제/수정 이력의 불완전성 기록. notes 없는 프로젝트를 이유 없음으로 간주 금지 |
| O03 core | 사용자 제공 거절 엑셀 | 파일 미제공 [U/X] | 없음 | 프로젝트 ID, 대상 기간/추출 조건, 거절/취소 구분, 원천 이유·작성일, 작성자 역할, 전체/선별 목록 여부 필요. DB와 불일치표 작성; 거절 엑셀만으로 전체 분모를 만들지 않음 |
| O04 enrich / **이번 제외** | 첫 연락 **시도**와 결과·재시도 | 전화 교환/발신 CRM 로그 테이블 미확인 [X]. 통화 API `call_type`, `call_time_secs`, `created_at`, `project_id`, `confidence` 응답 필드 [D] | `calls` 수집 경로 있으나 모집 표본/낮은 매칭신뢰도 제외; 완전 시도 로그 아님 | 사용자 지시로 요청·추출·효과 분석하지 않음. 후속 재개 시 무응답 로그/발신 실제시각 확인 필요. 성공 녹취만으로 연락률 계산 불가 |
| O05 enrich / **이번 제외** | 고객 희망 연락 시간·즉시 연락 선호 | `project_project.inspection_contact_datetime_string`, `inspection_contact_comment`, `is_inspection_contact_asap`, `postpone_status`, `postpone_date`, `postpone_time` [D] | 미수집 | 사용자 지시로 요청·추출하지 않음. 예약 희망과 실제 시도는 다르다는 출처 구분만 보존 |
| O06 enrich / **이번 제외** | 연락 가능/영업시간·주말·담당배정 지연 | 제출/배정/시도 시각, 업무시간·휴일표·휴무/대기열 [X] | 제출 시각만 일부 수집 | 사용자 지시로 영업시간/운영기준 요청하지 않음. 후속 연락 실험을 설계할 때 재확인할 항목 |
| O07 enrich | 검수 통화·카카오·메일의 메시지와 실제 발생시각 | 통화 API phone: `transcript`, `summary`, `created_at`; kakao: `message`, `sent_at`, `created_at`, `project_id` [D]; 이메일 API는 문서상 미포함 | 검수 프록시 및 `calls`는 일부; 전체 검수 메시지 미수집 | 사내에서 프로젝트 매칭 검증 후 구조화 사실만 반출. 녹취 수집 지연·매칭 오류·채널 누락률 기록. `summary`의 추론을 사실로 사용 금지 |
| O08 core | 검수 중 요구사항/예산/일정 조정, 범위 나누기·등록 권유 | `management_managenote` 전체 종류/`projecthistory_projecthistory.raw_data` [D]; CRM/작업 로그 [X] | 현재 n8n은 일부 memo만; 자동 발송/일정 변경 기록 필터 제외 [C] | 현 CaseLab 노트로 운영 개입 전체를 복구할 수 없음. 개입은 고객 초기 특성과 별도; 실제 시점·대상·작성 주체 확보 |
| O09 enrich | 검수 사전 세션 데이터 | `review_session.project_id`, `source_text`, `analysis`, `call_ids`, `call_summaries`, `created_at`, `updated_at` [C] | 기능 구현. 운영 사용률/프로젝트 매칭률 미확인 | 선택적 사용·한 행 덮어쓰기·프로젝트 ID nullable. 초기 원본 대체나 전체 준비도 지표로 사용 금지. 사후 검증 자료 후보만 |

## 7. 유입·계약까지의 연결

| ID / 우선순위 | 필요한 정보와 용도 | 정확한 원천 / 확인 수준 | CaseLab 현재 | 기간·제출시점 적합성 / 누락 처리 |
|---|---|---|---|---|
| M01 core | 가입 경로 | `client_client.acquisition_path`, `date_created`, `date_modified` [D] | 미수집 | **가입 경로 ≠ 해당 프로젝트 유입 경로**. 과거 계정의 이번 방문을 가입 경로로 귀속시키지 않음. 값 변경 가능 여부 확인 |
| M02 enrich | 해당 제출의 유입 채널/캠페인/소재/검색어/랜딩 | UTM·click/session·등록 폼 이벤트·GA/광고/CRM [X: 시스템명·컬럼 미확인] | 미수집 | `project_id`까지 사내 연결 가능한지, 최초/최근 touch와 lookback, consent/adblock 미관측 여부. 연결 안 되면 채널 단위 동기간 집계만; 개인 식별자 반출 금지 |
| M03 enrich | 캠페인 노출·클릭·방문·제출·광고비 | 광고 플랫폼/웹 분석/마케팅 집계표 [X] | 미수집 | 채널×일/주×캠페인 단위 분모와 통화/세금 기준. 유입 구성비만으로 획득 효율 주장 금지; 광고비가 없으면 CAC/ROAS 산출하지 않음 |
| M04 enrich | 등록 시작/이탈·문의→제출 경로 및 실험 할당 | 폼 이벤트·A/B 할당·CRM 리드→프로젝트 매핑 [X] | 미수집 | 제출 이전 확보 전략을 평가할 보조 자료. 배정시각·버전·대상·노출·오염/중복 계정 확인; 실험 할당이 없으면 인과효과로 표시 금지 |
| F01 core | 유효 계약 도달·최초 체결일 | `agreement_agreement.id`, `project_id`, `hide`, `date_deleted`, `status`; `sub_contract_subcontract.agreement_id`, `date_contracted`, `is_incomplete_addon`, `is_cancel_addon`, `is_not_conclusion_document` [D] | 유효 계약 존재→가공 상태, `agreement_id` 수집; **최초 체결일 미수집** | 프로젝트당 유효 최초 계약만. 특약 다건으로 계약수 중복 금지. 현재 숨김/삭제가 과거 계약 체결 사실을 지우는지 확인. 날짜 정밀도 일 단위 처리 |
| F02 enrich | 계약 금액·착수·완료·해지·실결제 | `sub_contract_subcontract.total_price`, `project_start_date`, `is_cancel_addon`; `agreement_agreement.date_start_progress`, `date_completed`; `milestone_milestone.contract_id`, `price`, `date_client_payment`, `date_end` [D] | `projects.contract_amount`, 진행/완료일 일부 [C] | 최신 특약 합계는 최초 계약금액과 다름; 관측창 내 금액만 비교. 0원 이유·환불/해지 의미 미확인. 마진/수익을 금액과 동일시 금지 |
| F03 enrich | 모집→실제 미팅·지원자 수 | `proposal_proposal.project_id`, `date_created`; `meeting_meeting.project_id`, `date_meeting`, `is_cancelled`, `date_cancelled`, `method`, `tune_status` [D] | `proposal_count`와 meeting 타임라인 일부 수집 [C] | 모집 이후 **결과/경로 지표**이지 제출 초기 원인변수 아님. 미팅 예약≠실제 진행, method 8은 미팅 없음. 기존 생성시각 커서는 사후취소 갱신 누락 가능 |
| F04 enrich | 장기 유지·재구매·불만·계약 취소 | 향후 프로젝트/계약 이력 [D], CS·환불·만족도 자료 [X] | 전용 수집 미확인 | 고정 관찰창 확보된 집단에서만. 신규 기업규모 2~3주 표본으로 장기 계약 품질을 판단하지 않음 |

## 8. 제출시점 복원과 새 기업규모 자료의 채택 기준

1. **제출시점에서 알고 있던 정보**를 초기 특성으로 쓴다. `reported_valid_at <= submitted_at`뿐 아니라 `known_at`이 언제인지도 확인한다. 나중에 기록한 회고 사실은 초기 원문과 같은 근거 등급이 아니다.
2. `project_projectinitialvalue`의 이름만으로 불변 스냅샷을 보증하지 않는다. `date_created/date_modified` 분포, 실제 저장 로직, 재제출 사례로 검증한다. 최신 `project_project.description`은 초기 원문 fallback으로 쓰지 않는다.
3. `detail_projectdetail`은 문서상 생성/수정 시각이 없다. `plan_status`, 자금, 인력, 일정의 제출 당시 값을 복원할 history/폼 응답 시각이 없으면 초기 특성 주 분석에서 제외하고 **시점 불명 참고 분석**에 둔다. 성과가 좋아 보인다는 이유로 승격하지 않는다.
4. 기업 규모 도입일은 **2026-09-03로 사용자 확인됨**. 1~8월 분석과 9/3 이후 최근 분석을 분리한다. 개인에게 기업규모 질문이 없으면 `not_applicable`; 회사이지만 질문 전이면 `not_collected`; 질문 표시 후 비어 있으면 `not_answered` 또는 미수집/미응답 구별 불가이면 `not_recorded`다.
5. 도입 직후 모두에게 같은 폼이 적용됐는지, 웹/모바일/앱·신규/기존 고객별 순차 적용인지 확인한다. **신규 폼 노출 모집단만으로 최근 표본을 만들고**, 원래 전체 표본의 규모별 전환율인 것처럼 확대하지 않는다.
6. 새 기업 규모의 전환율은 **9/3 이후 동일 폼 버전에서 제출하고 추출 기준시각까지 14일 이상 관찰된 최근 집단**에서만 비교한다. 장기관찰 계약 분석에 쓸 수 없으면 '계약 연계 아직 관찰 불가'로 적는다. 오래된 데이터를 회사명/법인 여부로 채워 크기를 맞추지 않는다.
7. 원문·필드의 충돌은 삭제하지 않는다. 초기 구조화 답변과 초기 원문이 다르면 둘 다 보존해 `conflict`; 수동 판독 근거와 해결 결과를 남긴다. 기록이 부족한 행을 '미준비'로 바꾸면 안 된다.

## 9. 운영자/데이터 담당자에게 한 번에 요청할 자료

아래는 시스템이 없다고 결론 낸 목록이 아니라 **현재 저장소만으로 출처가 확인되지 않은 정보**다. 답변은 각 행의 ID를 사용한다. 이미 있는 DB 필드는 새 설문으로 다시 수집할 필요 없다.

| 요청 | 연결 ID | 필요한 응답/자료 | 없을 때의 확정 처리 |
|---|---|---|---|
| 본진 현재 스키마와 운영 의미 | G01–G08, P01, O01, F01 | 현재 테이블/컬럼 메타데이터, 상태·취소 코드의 라벨/예외, 재제출·복제·삭제·계약 판정 규칙, UTC 확인 | 필수 사건시각/분모 미확보면 해당 전환율 발표 보류. 전체 비교를 가능하다고 가장하지 않음 |
| **최근 기업정보 폼** | C04–C05 | 9/3 수집 시작은 확인됨. 사용자 제공 예정 스키마의 table.column/JSON 키, 질문/보기/필수여부/조건부 노출, 화면별 롤아웃, 응답시각, 과거값 백필/수정 여부 | 규모/업종 분석을 미실시 또는 최근 부분집단 탐색으로 제한 |
| **개발자·의사결정·일정·자금 자료** | R02–R08, R14–R16 | **사용자가 다른 DB 스키마를 별도 추출해 제공 예정**. 현존 테이블/컬럼/원본은 미확인. 스키마 수신 후 `project_id` 연결, 문항 원문/답변, 기록/대상시점, 주체, 적용기간, 전체/선별 여부 확인 | 초기 근거가 없으면 미확인; 최신 회고 자료는 사후 해석 보조로만. 항목이 없어도 결론을 지어내지 않음 |
| 제출 원문/첨부 초기 복원 | P01, R09–R13 | initialvalue의 생성/갱신 로직, 파일 생성·삭제·임시 프로젝트 연결, 초기 폼 버전/자동문구/대필 표시 | 원본 없이 초기 내용/준비도 정량화 불가. 사용 가능한 차원만 명시 |
| 거절 엑셀 | O01–O03 | 프로젝트 ID 포함, 기간/추출 조건/사유 원문/코드/작성일/사례 선택 기준. 가능하면 수정 전 원천도 | 본진 사유가 확보되면 엑셀 없이 진행; 미확보 이유는 미상률로 보고 |
| 최초 연락·영업시간 | O04–O06 | **이번 요청 대상 아님**. 사용자 지시로 연락속도 효과 분석 제외 | 데이터 부족을 이번 블로커로 두지 않음 |
| 정책/업무 운영 변경 이력 | G09–G10, O08 | 이미 보유한 폼 개편·정책 이력이 있으면 참고. **운영 기준 추가 질의·자료 요청은 이번 제외** | 확인 못 한 정책 차이는 교란 가능성으로 명시, 인과 결론 금지 |
| 유입/마케팅 자료 | M01–M04 | 제출에 연결 가능한 UTM/캠페인/랜딩, 수집 시작일, 어트리뷰션 규칙, 동기간 비용·클릭/방문·폼 시작/제출 분모 | 고객 특성 가설은 도출하되 특정 채널의 효율/획득 비용 개선 주장 금지 |
| 결과 품질/계약 정의 | F01–F04 | 최초 유효 체결일 정의, 외부계약/해지/0원 처리, 결제/환불/CS 가용 여부 | 계약 존재/시점까지만 비교; 매출·이익·장기 품질로 확장 금지 |

자료를 주는 표준 단위는 CODEBOOK의 `project_id + feature_id + value + value_status + known_at + reported_valid_at + evidence`다. 이 인벤토리의 G/C/P/R/O/M/F ID는 **정보 묶음 추적용**이며 CODEBOOK의 실제 `feature_id`와 같지 않다. 양쪽 집단을 같은 조건으로 추출할 수 없거나 일부 고른 사례만 제공했다면 그 사실을 함께 적는다. 과거에 알 수 없었던 정보를 담당자의 기억만으로 채우지 않는다.

## 10. 확보 완료 체크와 근거 파일

확보 완료는 **컬럼 존재**만으로 체크하지 않는다. 각 ID에 다음 8개가 모두 기록되어야 한다: ①실제 출처 ②값 정의/enum ③최초·최종 관측일 ④월별 전체/모집/검수종료/대기 건수와 유효값률 ⑤결측 사유 ⑥제출시점 적합성 ⑦조인 1:N 및 표본 탈락률 ⑧원본 사례 대조 결과. 파일·원문·JSON·외부표의 자료 변경 버전도 고정한다.

현재 코드로 확인된 중요한 경계:

- [n8n/projects_incremental.sql](../../n8n/projects_incremental.sql): 모집 전환 외주만, 초기 예산/기간만, 고객 식별자 미반출, 현재 취소사유 미전송.
- [src/lib/sync/mapping.ts](../../src/lib/sync/mapping.ts): 초기 0값→NULL, 기간 일수 처리, 현재 상태 가공. 분석에서는 원천 플래그/시각/0의 의미가 추가로 필요하다.
- [n8n/managenote_incremental.sql](../../n8n/managenote_incremental.sql): 모집 전환 표본과 일부 note_type만 적재하며 자동 발송·일정 변경 로그 제외. **연락 시도 분석에는 이 필터를 그대로 적용할 수 없다.**
- [n8n/meeting_incremental.sql](../../n8n/meeting_incremental.sql): 사전 미팅 이벤트는 모집 이후, 생성시각 커서로 사후 수정 누락 가능. 검수 최초 연락 로그가 아니다.
- [migrations/013_review_session.sql](../../migrations/013_review_session.sql): nullable project_id, 한 행 덮어쓰기. 전체 제출의 불변 원본 저장소가 아니다.
- [HANDOFF.md](../../HANDOFF.md): 기존 취소·리스크·공급 태그는 목적과 표본이 다르다. 기존 AI 태그를 검수 거절 이유/초기 준비도로 재활용하지 않는다.
- [DATA_SCHEMA.md](../../DATA_SCHEMA.md): 현재 본진 후보 출처. `projecthistory_projecthistory`는 문서 자체에 재확인 요구, 기업규모·업종은 미기재. **문서에 없다는 사실은 실제 본진/외부에 없다는 증거가 아니다.**

고객 `client_id`·전화·이메일·담당자명·연락처·계정 식별자는 본진/승인된 내부 처리 환경에 둔다. 제출 원문/파일/통화에 섞인 식별정보도 내보내기 전에 제거한다. 기존 `scrubPii`는 이름을 제거하지 못하므로 원문 비식별화 완료로 간주하지 않는다. 분석 보고서에는 프로젝트 ID, 필요한 파생변수, 비식별 근거 문장과 집계만 사용한다.
