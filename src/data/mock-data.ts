import type { AppNotification, CaseReview, ProjectFull } from "./types";

/** 프로토타입(CaseLab_v2.0)에서 이식한 mock 프로젝트 데이터 */
export const MOCK_PROJECTS: ProjectFull[] = [
  {
    id: "p5",
    name: "PHP 기반 스포츠 맞춤형 O2O 플랫폼 구축",
    client: "스포츠온",
    cat: "플랫폼",
    tech: "PHP · Laravel · 웹",
    budget: "4,500만원",
    period: "160일",
    status: "검수",
    stage: 1,
    manager: "김세민",
    updated: "07-02",
    submittedAt: "07-01",
    daysAgo: 0,
    contractAmount: null,
    contractPeriod: null,
    issueLog: [],
    intake: {
      posting: {
        title: "스포츠 시설 O2O 플랫폼 구축 개발사 모집 공고",
        background:
          "스포츠 시설 예약 플랫폼의 사용성 개선과 제휴 시설 정산 체계 고도화를 목표로 합니다. 기존 정적 예약 페이지를 동적 UI로 개편하고, 제휴 시설별 정산 로직을 자동화하는 것이 핵심 목표입니다.",
        scopeSummary: [
          "기획 및 디자인: 예약 플로우 UX 개선안 도출 및 정산 관리자 화면 설계",
          "SW 개발: PHP(Laravel) 기반 프론트/백엔드 개발, 결제·정산 모듈 연동, MySQL 스키마 설계",
        ],
        featureGroups: [
          {
            heading: "2-1. 예약 플로우 개선",
            items: [
              "시설 검색 및 필터링 기능 고도화",
              "실시간 예약 가능 여부 노출",
              "모바일 반응형 UI 적용",
            ],
          },
          {
            heading: "2-2. 제휴 정산 모듈",
            items: [
              "제휴 시설별 정산 주기 설정 기능",
              "자동 정산 내역 산출 및 리포트 생성",
              "PG사 결제 데이터 연동",
            ],
          },
          {
            heading: "2-3. 관리자 페이지",
            items: [
              "제휴 시설 등록 및 승인 관리",
              "회원 예약 이력 관리",
              "정산 승인 플로우 개선",
            ],
          },
        ],
        nonFunctional: [
          "성능/규격: 정산 산출 시 비동기 처리로 관리자 페이지 응답 지연 방지",
          "보안/인증: 결제 정보 및 회원 개인정보 접근 권한 제어",
        ],
        techStack: [
          "Frontend: HTML / CSS / JavaScript",
          "Backend: PHP (Laravel)",
          "Database: MySQL",
        ],
        schedule: {
          start: "계약 완료 후 즉시",
          milestones: [
            "착수 후 2개월 차 예약 플로우 개편 완료",
            "3개월 차 정산 모듈 연동 완료",
            "5개월 차 관리자 페이지 개편 및 최종 테스트",
          ],
          due: "착수일로부터 160일 이내",
        },
        qualRequired: [
          "Laravel 기반 웹 서비스 구축 경험이 있는 자",
          "업력 1년 이상의 사업자만 지원 가능합니다",
        ],
        qualPreferred: [
          "O2O 예약 플랫폼 개발 경험자",
          "PG 연동 및 정산 로직 설계 경험자 우대",
        ],
        deliverables: ["소스 코드 원본", "기능 명세서 및 DB 스키마 문서"],
      },
      call: {
        title: "검수 확인 콜 — 클라이언트",
        date: "07-01",
        summary: [
          "정산 주기가 제휴 시설마다 상이 — 정산 모듈 설계 확정 전에는 견적 산출이 어려움을 사전 확인",
          "경쟁 서비스 3곳 벤치마킹 자료를 클라이언트가 보유 — 요구사항 정의서에 반영 예정",
        ],
        lines: [
          { t: "00:02", who: "김세민 (위시켓)", text: "프로젝트 개요와 정산 구조부터 확인하겠습니다." },
          { t: "03:15", who: "클라이언트", text: "제휴 시설마다 정산 주기가 달라서 그 부분이 개발 범위에 영향이 클 것 같아요." },
          { t: "07:40", who: "김세민 (위시켓)", text: "정산 주기 표를 먼저 정리해 주시면 개발사 모집 공고에 반영하겠습니다." },
        ],
      },
    },
    riskTags: ["연동 범위"],
    qna: [],
    timeline: [
      { stage: "검수", date: "07-01", title: "프로젝트 등록", desc: "유사 플랫폼 사례 2건 검색 · 리스크 사전 검토 중" },
    ],
  },
  {
    id: "p1",
    name: "OCR 증권 분석 및 LLM 과실 판단 설계사 구독형 앱 개발",
    client: "한빛보험서비스",
    cat: "AI",
    tech: "OCR · LLM · 구독형 앱",
    budget: "7,500만원",
    period: "170일",
    status: "계약",
    stage: 3,
    manager: "장수룡",
    updated: "06-28",
    submittedAt: "05-01",
    daysAgo: 4,
    contractAmount: "7,500만원",
    contractPeriod: "170일",
    intake: {
      posting: {
        title: "보험설계사용 AI 증권분석 앱 개발사 모집 공고",
        background:
          "보험설계사가 사고 증권을 촬영하면 OCR로 텍스트를 추출하고 LLM으로 과실 비율 판단을 보조하는 구독형 앱을 개발합니다. 설계사의 상담 시간을 단축하고 판단 근거의 일관성을 높이는 것이 핵심 목표입니다.",
        scopeSummary: [
          "기획 및 디자인: OCR 업로드·분석 결과 화면 UX 설계, 구독 결제 플로우 설계",
          "SW 개발: OCR·LLM 연동 백엔드 API 개발, 모바일 웹 프론트엔드 구현, 구독 결제 모듈 연동",
        ],
        featureGroups: [
          {
            heading: "2-1. 증권 분석",
            items: [
              "증권 이미지 업로드 및 OCR 텍스트 추출",
              "추출 텍스트 기반 LLM 과실 비율 판단",
              "분석 결과 리포트 생성 및 저장",
            ],
          },
          {
            heading: "2-2. 구독 관리",
            items: ["설계사별 구독 등급 및 결제 관리", "월간 분석 건수 제한 및 알림"],
          },
          {
            heading: "2-3. 데이터 보안",
            items: ["증권 원본 이미지 자동 파기 스케줄러", "추출 텍스트 암호화 저장"],
          },
        ],
        nonFunctional: [
          "성능/규격: OCR 분석 결과는 비동기 처리로 페이지 새로고침 없이 노출",
          "보안/인증: 금융 개인정보 및 증권 이미지에 대한 접근 권한 제어",
        ],
        techStack: [
          "Frontend: HTML / CSS / JavaScript",
          "Backend: Python (FastAPI) · LLM API 연동",
          "Database: PostgreSQL",
        ],
        schedule: {
          start: "계약 완료 후 즉시",
          milestones: [
            "착수 후 2개월 차 OCR·분석 기능 완료",
            "4개월 차 구독 결제 연동 완료",
            "5개월 차 보안 검증 및 최종 테스트",
          ],
          due: "착수일로부터 170일 이내",
        },
        qualRequired: [
          "OCR 및 LLM API 연동 개발 경험이 있는 자",
          "업력 1년 이상의 사업자만 지원 가능합니다",
        ],
        qualPreferred: [
          "금융/보험 데이터 처리 프로젝트 경험자",
          "개인정보 보안 설계 제안이 가능한 자 우대",
        ],
        deliverables: ["소스 코드 원본", "기능 명세서 및 수정된 DB 스키마 문서"],
      },
      call: {
        title: "검수 확인 콜 — 클라이언트",
        date: "05-01",
        summary: [
          "과실 판단 결과의 법적 책임 범위에 대한 우려를 클라이언트가 사전 언급",
          "증권 원본 이미지 보관 정책에 대한 내부 가이드라인 존재 확인",
        ],
        lines: [
          { t: "00:03", who: "김세민 (위시켓)", text: "과실 판단 기능의 법적 리스크를 어떻게 보고 계신가요?" },
          { t: "05:10", who: "클라이언트", text: "참고용으로만 제공하고 최종 판단은 설계사가 하는 구조로 가려고 합니다." },
          { t: "09:22", who: "클라이언트", text: "증권 원본 이미지는 저장 기간을 최소화해야 합니다." },
        ],
      },
    },
    issueLog: [
      { type: "이슈", date: "05-19", src: "후보미팅 1차 — 개발사 A", text: "개발사 후보 3곳 중 2곳이 OCR·LLM 결합 프로젝트 경험 없음" },
      { type: "합의", date: "05-19", src: "후보미팅 1차 — 개발사 A", text: "검증 PoC 2주 선행 진행으로 합의" },
      { type: "과업 범위", date: "05-22", src: "후보미팅 2차 — 개발사 A", text: "자체 OCR 모듈 → 상용 OCR API로 변경" },
      { type: "예산 언급", date: "05-22", src: "후보미팅 2차 — 개발사 A", text: "상용 OCR API 라이선스 월 30만원 추가" },
      { type: "법무·보안", date: "05-22", src: "후보미팅 2차 — 개발사 A", text: "과실 판단 결과에 \"참고용\" 고지 문구 추가, 최종 판단은 설계사 몫으로 구조 확정" },
      { type: "법무·보안", date: "05-22", src: "후보미팅 2차 — 개발사 A", text: "증권 원본 이미지는 24시간 내 파기, 추출 텍스트만 저장" },
    ],
    riskTags: ["경험 부족", "보안 요건"],
    meeting: {
      title: "후보미팅 2차 — 개발사 A",
      date: "05-22",
      summary: [
        "개발사 A, 자체 OCR 모듈 대신 상용 OCR API 사용 제안 — 라이선스 월 30만원 추가되나 정확도·일정 면에서 유리",
        "클라이언트, 과실 판단 결과의 법적 책임 범위 우려 — 결과에 \"참고용\" 고지 문구 + 최종 판단은 설계사 몫으로 합의",
        "보안 요건: 증권 원본 이미지는 24시간 내 파기, 추출 텍스트만 저장 — 개발사 수용",
        "AI 리스크 추출: 유사 프로젝트 경험 부족 → 검증 PoC 2주 선행 진행 합의",
      ],
      lines: [
        { t: "00:03", who: "김세민 (위시켓)", text: "오늘은 OCR 처리 방식과 보안 요건을 중심으로 논의하겠습니다." },
        { t: "04:12", who: "개발사 A", text: "자체 OCR 모듈보다 상용 OCR API를 쓰는 것이 정확도와 일정 면에서 유리합니다. 라이선스가 월 30만원 정도 추가됩니다." },
        { t: "11:40", who: "클라이언트", text: "과실 판단 결과를 그대로 고객에게 보여줘도 법적으로 문제가 없을까요? 책임 범위가 걱정됩니다." },
        { t: "13:05", who: "개발사 A", text: "판단 결과에 참고용 고지를 붙이고, 최종 판단은 설계사가 하는 구조를 권장드립니다." },
        { t: "21:30", who: "클라이언트", text: "증권 원본 이미지는 서버에 남기지 않았으면 합니다." },
        { t: "22:14", who: "개발사 A", text: "추출 텍스트만 저장하고 원본은 24시간 내 파기하는 것으로 처리 가능합니다." },
      ],
    },
    qna: [
      { q: "서버는 어떻게 증설 예정이신가요?", by: "개발사 A", at: "모집" },
      { q: "기존 사내 시스템과의 연동 범위가 어디까지인가요?", by: "개발사 B", at: "모집" },
    ],
    timeline: [
      { stage: "검수", date: "05-02", title: "검수 완료", desc: "유사 사례 3건 검토 후 상담 진행" },
      { stage: "모집", date: "05-19", title: "후보미팅 2회", desc: "녹취록 AI 요약 → 리스크 1건 자동 추출" },
      { stage: "모집", date: "05-26", title: "개발사 Q&A 2건 수집", desc: "서버 증설 · 연동 범위 질문" },
      { stage: "계약", date: "06-15", title: "계약 체결", desc: "" },
    ],
  },
  {
    id: "p8",
    name: "위치 기반 병원 검색 및 다국어 뷰티/의료 독립몰 MVP 구축",
    client: "온누리헬스케어",
    cat: "병원",
    tech: "웹 · 다국어 커머스",
    budget: "1,500만원",
    period: "45일",
    status: "모집",
    stage: 2,
    manager: "장수룡",
    updated: "06-30",
    submittedAt: "06-09",
    daysAgo: 2,
    contractAmount: null,
    contractPeriod: null,
    intake: {
      posting: {
        title: "위치 기반 병원 검색 다국어 독립몰 MVP 개발사 모집 공고",
        background:
          "국내 방문 외국인을 대상으로 위치 기반 병원 검색 및 예약, 뷰티/의료 상품 판매를 지원하는 다국어 독립몰 MVP를 구축합니다. 빠른 시장 검증을 위해 핵심 기능 위주의 경량 MVP로 개발하는 것이 목표입니다.",
        scopeSummary: [
          "기획 및 디자인: 다국어 UI 화면 설계, 병원 검색·예약 플로우 설계",
          "SW 개발: 프론트엔드 반응형 퍼블리싱, 병원 검색 API 연동, 상품 판매 모듈 개발",
        ],
        featureGroups: [
          {
            heading: "2-1. 병원 검색·예약",
            items: [
              "위치 기반 병원 검색 및 지도 노출",
              "진료과·언어 지원 여부 필터링",
              "상담 예약 신청 기능",
            ],
          },
          {
            heading: "2-2. 다국어 커머스",
            items: ["영/중/일 3개 언어 상품 페이지", "뷰티/의료 상품 카탈로그 및 결제"],
          },
        ],
        nonFunctional: [
          "성능/규격: 병원 검색 결과는 비동기 처리로 즉시 노출",
          "보안/인증: 상담 신청 시 수집되는 개인정보 접근 권한 제어",
        ],
        techStack: [
          "Frontend: HTML / CSS / JavaScript",
          "Backend: Node.js (Express)",
          "Database: MySQL",
        ],
        schedule: {
          start: "계약 완료 후 즉시",
          milestones: [
            "착수 후 3주 차 병원 검색 기능 완료",
            "5주 차 다국어 커머스 연동 완료",
            "6주 차 최종 테스트 및 오픈",
          ],
          due: "착수일로부터 45일 이내",
        },
        qualRequired: [
          "다국어 웹 서비스 구축 경험이 있는 자",
          "업력 1년 이상의 사업자만 지원 가능합니다",
        ],
        qualPreferred: [
          "의료·헬스케어 도메인 프로젝트 경험자",
          "개인정보 보호 관련 법무 검토 협업 경험자 우대",
        ],
        deliverables: ["소스 코드 원본", "기능 명세서 문서"],
      },
      call: {
        title: "검수 확인 콜 — 클라이언트",
        date: "06-09",
        summary: [
          "의료법상 개인정보 처리 위탁 범위에 대한 법무 검토 필요성 사전 인지",
          "다국어(영/중/일) 번역 리소스는 클라이언트가 별도 제공 예정",
        ],
        lines: [
          { t: "00:04", who: "장수룡 (위시켓)", text: "개인정보 처리 관련해서는 법무 검토가 필요할 것 같습니다." },
          { t: "04:50", who: "클라이언트", text: "번역은 저희 쪽에서 제공하는 걸로 준비하겠습니다." },
        ],
      },
    },
    issueLog: [
      { type: "법무·보안", date: "06-26", src: "사전 미팅 1차 — 개발사 E", text: "의료법상 병원 상담·예약 정보의 개인정보 처리 위탁 범위 — 법무 검토가 계약 전에 선행되어야 한다는 의견" },
    ],
    riskTags: ["개인정보"],
    qna: [{ q: "기존 EMR과의 연동이 필요한가요?", by: "개발사 E", at: "모집" }],
    timeline: [
      { stage: "검수", date: "06-10", title: "검수 완료", desc: "유사 병원 플랫폼 사례 1건 참고" },
      { stage: "모집", date: "06-24", title: "공고 게시", desc: "개발사 Q&A 1건 수집" },
    ],
  },
  {
    id: "p3",
    name: "네이버/카카오 맵 API 기반 관광지 모니터링 시각화 웹 구축",
    client: "한올관광개발",
    cat: "지도",
    tech: "지도API · 대시보드",
    budget: "500만원",
    period: "45일",
    status: "진행",
    stage: 4,
    manager: "이상민",
    updated: "06-25",
    submittedAt: "04-07",
    daysAgo: 7,
    contractAmount: "500만원",
    contractPeriod: "45일",
    intake: {
      posting: {
        title: "지도 API 기반 관광지 모니터링 대시보드 개발사 모집 공고",
        background:
          "네이버/카카오 맵 API를 활용해 관광지 방문객 및 환경 센서 데이터를 실시간으로 시각화하는 모니터링 대시보드를 구축합니다. 관리자가 지점별 이상 상황을 즉시 파악할 수 있도록 하는 것이 핵심 목표입니다.",
        scopeSummary: [
          "기획 및 디자인: 지도 기반 대시보드 화면 설계",
          "SW 개발: 지도 API 연동 프론트엔드 개발, 센서 데이터 수집 백엔드 API 개발",
        ],
        featureGroups: [
          {
            heading: "2-1. 지도 시각화",
            items: ["관광지 지점별 마커 및 상태 표시", "지점 클릭 시 상세 데이터 팝업"],
          },
          {
            heading: "2-2. 모니터링·알림",
            items: ["이상치 발생 시 관리자 알림 기능", "기간별 데이터 조회 및 다운로드"],
          },
        ],
        nonFunctional: [
          "성능/규격: 센서 데이터는 비동기 폴링으로 지연 없이 갱신",
          "보안/인증: 관리자 계정별 접근 권한 제어",
        ],
        techStack: [
          "Frontend: HTML / CSS / JavaScript (지도 API)",
          "Backend: Node.js",
          "Database: MySQL",
        ],
        schedule: {
          start: "계약 완료 후 즉시",
          milestones: [
            "착수 후 3주 차 지도 시각화 완료",
            "5주 차 알림 기능 완료",
            "6주 차 최종 테스트 및 오픈",
          ],
          due: "착수일로부터 45일 이내",
        },
        qualRequired: [
          "네이버/카카오 맵 API 활용 경험이 있는 자",
          "업력 1년 이상의 사업자만 지원 가능합니다",
        ],
        qualPreferred: ["실시간 데이터 시각화 대시보드 개발 경험자 우대"],
        deliverables: ["소스 코드 원본", "기능 명세서 문서"],
      },
      call: {
        title: "검수 확인 콜 — 클라이언트",
        date: "04-07",
        summary: [
          "모니터링 지점 수가 확정되지 않아 API 호출량 산정에 유동성 있음",
          "센서 데이터 연동은 클라이언트 측 통신 회선 사용 예정",
        ],
        lines: [
          { t: "00:03", who: "이상민 (위시켓)", text: "모니터링 지점 수가 초기 몇 곳으로 시작하시나요?" },
          { t: "02:40", who: "클라이언트", text: "우선 5곳으로 시작해서 늘려갈 계획입니다." },
        ],
      },
    },
    issueLog: [
      { type: "예산 언급", date: "04-24", src: "후보미팅 1차 — 개발사 C", text: "지도 API 호출량이 견적 산정 기준을 초과할 가능성" },
      { type: "합의", date: "04-24", src: "후보미팅 1차 — 개발사 C", text: "타일 캐싱 도입을 전제로 견적 합의" },
      { type: "과업 범위", date: "05-02", src: "후보미팅 3차 — 개발사 C", text: "관리자 이상치 알림 기능 추가 요청" },
    ],
    riskTags: ["비용 증가"],
    meeting: {
      title: "후보미팅 1차 — 개발사 C",
      date: "04-24",
      summary: [
        "지도 API 호출량이 견적 산정 기준을 초과할 가능성 — 타일 캐싱 도입을 전제로 견적 합의",
        "관광지 센서 데이터는 클라이언트 회선으로 전송 — 안정성 사전 점검 필요 확인",
        "AI 이슈 추출: API 라이선스 비용 증가 가능성 → 이슈 로그에 자동 반영됨",
      ],
      lines: [
        { t: "00:04", who: "이상민 (위시켓)", text: "오늘은 지도 API 구성과 견적 범위를 논의하겠습니다." },
        { t: "05:12", who: "개발사 C", text: "모니터링 지점이 늘어나면 호출량이 견적 기준을 넘을 수 있습니다. 타일 캐싱을 전제로 견적을 잡겠습니다." },
        { t: "11:30", who: "클라이언트", text: "센서 데이터는 저희 회선으로 전송되는데, 안정성 점검이 필요할 것 같습니다." },
        { t: "16:45", who: "개발사 C", text: "알림 기능은 우선순위를 정해서 2차 스프린트에 반영하는 것을 제안드립니다." },
      ],
    },
    qna: [],
    timeline: [
      { stage: "검수", date: "04-08", title: "검수 완료", desc: "" },
      { stage: "모집", date: "04-22", title: "후보미팅 3회", desc: "" },
      { stage: "계약", date: "05-12", title: "계약 체결", desc: "" },
      { stage: "진행", date: "06-25", title: "진행 중", desc: "" },
    ],
  },
  {
    id: "p2",
    name: "고도몰 기반 가구 쇼핑몰 전면 UI/UX 리뉴얼",
    client: "미래가구",
    cat: "커머스",
    tech: "고도몰 · 퍼블리싱",
    budget: "1,500만원",
    period: "45일",
    status: "완료(취소)",
    stage: 5,
    manager: "김세민",
    updated: "06-20",
    submittedAt: "05-04",
    daysAgo: 12,
    contractAmount: null,
    contractPeriod: null,
    cancel: {
      stage: "계약",
      reason: "예산 협의 결렬 — 클라이언트 내부 예산 축소. 개발사 2곳 중도 이탈 후 재협의 무산",
    },
    intake: {
      posting: {
        title: "가구 쇼핑몰 UI/UX 리뉴얼 개발사 모집 공고",
        background:
          "고도몰 기반 가구 쇼핑몰의 전면 UI/UX를 리뉴얼합니다. 노후화된 스킨과 상세페이지를 개선해 구매 전환율을 높이는 것이 핵심 목표입니다.",
        scopeSummary: [
          "기획 및 디자인: 전면 스킨 및 상세페이지 UI 개선안 도출",
          "SW 개발: 고도몰 스킨 퍼블리싱 및 반응형 적용",
        ],
        featureGroups: [
          {
            heading: "2-1. 스킨 리뉴얼",
            items: ["메인·카테고리 페이지 스킨 개편", "반응형 모바일 대응"],
          },
          {
            heading: "2-2. 상세페이지 개편",
            items: ["상세페이지 템플릿 3종 신규 제작", "상품 옵션 선택 UI 개선"],
          },
        ],
        nonFunctional: ["성능/규격: 모바일 페이지 로딩 속도 최적화"],
        techStack: ["Frontend: HTML / CSS / JavaScript (고도몰 스킨)", "Platform: 고도몰5"],
        schedule: {
          start: "계약 완료 후 즉시",
          milestones: [
            "착수 후 3주 차 스킨 개편 완료",
            "5주 차 상세페이지 개편 완료",
            "6주 차 최종 테스트 및 오픈",
          ],
          due: "착수일로부터 45일 이내",
        },
        qualRequired: [
          "고도몰 스킨 퍼블리싱 경험이 있는 자",
          "업력 1년 이상의 사업자만 지원 가능합니다",
        ],
        qualPreferred: ["가구·인테리어 쇼핑몰 리뉴얼 경험자 우대"],
        deliverables: ["소스 코드 원본", "스킨 파일 일체"],
      },
      call: {
        title: "검수 확인 콜 — 클라이언트",
        date: "05-04",
        summary: [
          "리뉴얼 범위(스킨/상세페이지)에 대한 클라이언트 내부 의견이 아직 미확정",
          "예산 확정 권한이 있는 담당자 확인 필요",
        ],
        lines: [
          { t: "00:02", who: "김세민 (위시켓)", text: "리뉴얼 범위는 스킨만 하실지, 상세페이지도 포함하실지요?" },
          { t: "03:12", who: "클라이언트", text: "아직 내부적으로 논의 중이라 확정은 안됐습니다." },
        ],
      },
    },
    issueLog: [
      { type: "이슈", date: "05-20", src: "후보미팅 1차 — 개발사 D", text: "견적 대비 요구 범위(스킨 전면 개편 + 상세페이지 3종) 과다" },
      { type: "일정", date: "05-20", src: "후보미팅 1차 — 개발사 D", text: "클라이언트 내부 결재 라인 변경으로 요구사항 확정 2주 지연 예고" },
    ],
    riskTags: ["의사결정 지연", "예산 협의"],
    meeting: {
      title: "후보미팅 1차 — 개발사 D",
      date: "05-20",
      summary: [
        "개발사 D: 견적 대비 요구 범위(스킨 전면 개편 + 상세페이지 3종) 과다 의견 — 범위 축소 또는 예산 증액 필요",
        "클라이언트 내부 결재 라인 변경으로 요구사항 확정 지연 — 2주 내 재협의하기로 함",
        "AI 리스크 추출: 예산-범위 불일치 → 리스크 항목에 자동 반영됨",
      ],
      lines: [
        { t: "00:04", who: "김세민 (위시켓)", text: "오늘은 견적 범위와 일정 협의를 진행하겠습니다." },
        { t: "06:31", who: "개발사 D", text: "이 예산으로 스킨 전면 개편에 상세페이지 3종까지는 어렵습니다. 범위를 줄이거나 예산을 조정해야 합니다." },
        { t: "12:20", who: "클라이언트", text: "내부 결재 라인이 바뀌어서 요구사항 확정이 좀 늦어지고 있습니다. 2주만 시간을 주시면 정리하겠습니다." },
        { t: "18:47", who: "개발사 D", text: "확정되는 대로 재견적 드리겠습니다. 다만 착수 일정은 그만큼 밀립니다." },
      ],
    },
    qna: [],
    timeline: [
      { stage: "검수", date: "05-05", title: "검수 완료", desc: "" },
      { stage: "모집", date: "05-20", title: "후보미팅 1회", desc: "개발사 반응: 예산 대비 과업 범위 과다 우려" },
      { stage: "계약", date: "06-20", title: "중도 취소", desc: "취소 사유: 예산 협의 결렬 — 클라이언트 내부 예산 축소", cancel: true },
    ],
  },
  {
    id: "p4",
    name: "소방분기배관 도면 자동 컷팅 및 벤딩 데이터 변환 프로그램 개발",
    client: "세진제조",
    cat: "자동화",
    tech: "CAD · 업무자동화",
    budget: "1,500만원",
    period: "100일",
    status: "완료(성공)",
    stage: 5,
    manager: "김세민",
    updated: "06-10",
    submittedAt: "02-13",
    daysAgo: 22,
    contractAmount: "2,000만원",
    contractPeriod: "100일",
    intake: {
      posting: {
        title: "소방분기배관 도면 자동화 프로그램 개발사 모집 공고",
        background:
          "소방분기배관 도면에서 컷팅 데이터를 자동 산출하고 벤딩 장비가 인식 가능한 데이터로 변환하는 업무자동화 프로그램을 개발합니다. 수작업 변환 공수를 줄이는 것이 핵심 목표입니다.",
        scopeSummary: [
          "기획 및 디자인: 도면 업로드·변환 결과 확인 화면 설계",
          "SW 개발: CAD 도면 파싱 로직 개발, 벤딩 장비(YBC) 데이터 포맷 변환 모듈 개발",
        ],
        featureGroups: [
          {
            heading: "2-1. 도면 파싱",
            items: ["CAD 도면 파일 업로드 및 자동 컷팅 치수 산출"],
          },
          {
            heading: "2-2. 벤딩 데이터 변환",
            items: ["벤딩 장비(YBC) 포맷 변환 및 출력", "변환 결과 리포트 화면 2종 제공"],
          },
        ],
        nonFunctional: ["성능/규격: 대용량 도면 파일 처리 시 처리 진행률 표시"],
        techStack: [
          "Frontend: HTML / CSS / JavaScript",
          "Backend: Python",
          "CAD 연동: DXF 파서",
        ],
        schedule: {
          start: "계약 완료 후 즉시",
          milestones: [
            "착수 후 6주 차 도면 파싱 완료",
            "10주 차 벤딩 데이터 변환 완료",
            "14주 차 최종 테스트",
          ],
          due: "착수일로부터 100일 이내",
        },
        qualRequired: [
          "CAD 도면(DXF) 파싱 개발 경험이 있는 자",
          "업력 1년 이상의 사업자만 지원 가능합니다",
        ],
        qualPreferred: ["제조 설비 데이터 연동 경험자 우대"],
        deliverables: ["소스 코드 원본", "기능 명세서 문서"],
      },
      call: {
        title: "검수 확인 콜 — 클라이언트",
        date: "02-13",
        summary: [
          "벤딩 장비(YBC) 데이터 포맷에 대한 공식 문서 보유 여부 불확실",
          "현장 엔지니어 인터뷰 협조 가능하다고 확인",
        ],
        lines: [
          { t: "00:03", who: "김세민 (위시켓)", text: "벤딩 장비 데이터 포맷 문서는 보유하고 계신가요?" },
          { t: "02:20", who: "클라이언트", text: "공식 문서는 없고 현장 엔지니어가 알고 있습니다." },
        ],
      },
    },
    issueLog: [
      { type: "이슈", date: "03-04", src: "후보미팅 1차 — 개발사 B", text: "벤딩 장비(YBC) 데이터 포맷 문서 부재 확인" },
      { type: "합의", date: "03-04", src: "후보미팅 1차 — 개발사 B", text: "현장 엔지니어 인터뷰로 보완하기로 합의" },
      { type: "과업 범위", date: "03-12", src: "후보미팅 2차 — 개발사 B", text: "리포트 화면 2종 추가 요청" },
      { type: "예산 언급", date: "03-12", src: "후보미팅 2차 — 개발사 B", text: "과업 추가로 견적 +500만원 반영" },
    ],
    riskTags: ["문서 부재"],
    qna: [],
    timeline: [
      { stage: "검수", date: "02-14", title: "검수 완료", desc: "" },
      { stage: "모집", date: "03-02", title: "후보미팅 2회", desc: "" },
      { stage: "계약", date: "03-20", title: "계약 체결", desc: "" },
      { stage: "진행", date: "05-30", title: "검수 배포", desc: "" },
      { stage: "완료", date: "06-10", title: "완료(성공)", desc: "리뷰 작성 완료 → 팀 사례로 축적됨" },
    ],
  },
  {
    id: "p6",
    name: "상품 크롤링 및 해외 플랫폼 자동 리스팅 프로그램 개발",
    client: "글로벌셀러",
    cat: "자동화",
    tech: "크롤링 · RPA",
    budget: "500만원",
    period: "30일",
    status: "완료(성공)",
    stage: 5,
    manager: "이상민",
    updated: "2025-11",
    submittedAt: "2025-06",
    daysAgo: 250,
    contractAmount: "500만원",
    contractPeriod: "30일",
    intake: {
      posting: {
        title: "해외 플랫폼 자동 리스팅 프로그램 개발사 모집 공고",
        background:
          "자사 상품 정보를 크롤링해 해외 판매 플랫폼에 자동으로 리스팅하는 RPA 프로그램을 개발합니다. 수작업 등록 공수를 없애는 것이 핵심 목표입니다.",
        scopeSummary: [
          "기획 및 디자인: 리스팅 현황 관리 화면 설계",
          "SW 개발: 상품 크롤링 모듈 개발, 플랫폼별 API 어댑터 개발",
        ],
        featureGroups: [
          { heading: "2-1. 상품 크롤링", items: ["자사몰 상품 정보 자동 수집"] },
          {
            heading: "2-2. 자동 리스팅",
            items: ["플랫폼별 API 어댑터 구조로 리스팅", "리스팅 실패 건 재시도 및 알림"],
          },
        ],
        nonFunctional: ["성능/규격: 플랫폼 API 정책 변경에 대응 가능한 어댑터 구조 설계"],
        techStack: ["Backend: Python", "RPA: 크롤링 프레임워크"],
        schedule: {
          start: "계약 완료 후 즉시",
          milestones: ["착수 후 2주 차 크롤링 모듈 완료", "4주 차 리스팅 연동 완료"],
          due: "착수일로부터 30일 이내",
        },
        qualRequired: [
          "크롤링·RPA 개발 경험이 있는 자",
          "업력 1년 이상의 사업자만 지원 가능합니다",
        ],
        qualPreferred: ["해외 이커머스 플랫폼 API 연동 경험자 우대"],
        deliverables: ["소스 코드 원본"],
      },
      call: {
        title: "검수 확인 콜 — 클라이언트",
        date: "2025-06",
        summary: ["대상 플랫폼의 API 정책 변경 이력이 잦은 편이라는 점 사전 확인"],
        lines: [
          { t: "00:02", who: "이상민 (위시켓)", text: "대상 플랫폼 API가 자주 바뀌는 편인가요?" },
          { t: "01:45", who: "클라이언트", text: "네, 작년에도 두 차례 정책이 바뀌었습니다." },
        ],
      },
    },
    issueLog: [
      { type: "이슈", date: "2025-07", src: "사전 미팅 — 개발사 F", text: "해외 플랫폼 리스팅 API 정책 변경 가능성" },
      { type: "과업 범위", date: "2025-07", src: "사전 미팅 — 개발사 F", text: "리스팅 대상 플랫폼 3종 → 2종으로 축소" },
    ],
    riskTags: ["데이터 정제"],
    qna: [],
    timeline: [
      { stage: "검수", date: "2025-06", title: "검수 완료", desc: "" },
      { stage: "계약", date: "2025-08", title: "계약 체결", desc: "" },
      { stage: "완료", date: "2025-11", title: "완료(성공)", desc: "리뷰 작성 완료" },
    ],
  },
  {
    id: "p7",
    name: "학생별 성적 리포트 자동 생성 프로그램 개발",
    client: "한주에듀",
    cat: "자동화",
    tech: "Word/PDF 출력 · 자동화",
    budget: "300만원",
    period: "21일",
    status: "완료(취소)",
    stage: 5,
    manager: "장수룡",
    updated: "2024-09",
    submittedAt: "2024-05",
    daysAgo: 600,
    contractAmount: null,
    contractPeriod: null,
    cancel: {
      stage: "계약",
      reason: "요구 양식 확정 지연으로 개발사 계약 포기 — 지점별 리포트 양식이 계약 단계에서 3차례 변경",
    },
    intake: {
      posting: {
        title: "학생 성적 리포트 자동 생성 프로그램 개발사 모집 공고",
        background:
          "학원 지점별 학생 성적 데이터를 취합해 Word/PDF 리포트로 자동 생성하는 프로그램을 개발합니다. 지점 담당자의 수작업 리포트 작성 부담을 줄이는 것이 핵심 목표입니다.",
        scopeSummary: [
          "기획 및 디자인: 리포트 양식 표준안 도출",
          "SW 개발: 성적 데이터 취합 로직 개발, Word/PDF 자동 생성 모듈 개발",
        ],
        featureGroups: [
          { heading: "2-1. 데이터 취합", items: ["지점별 성적 데이터 업로드 및 취합"] },
          {
            heading: "2-2. 리포트 생성",
            items: ["표준 양식 기반 Word/PDF 자동 생성", "지점별 양식 커스터마이징 옵션"],
          },
        ],
        nonFunctional: ["성능/규격: 대량 학생 데이터 일괄 생성 시 처리 진행률 표시"],
        techStack: ["Backend: Python", "문서 생성: Word/PDF 라이브러리"],
        schedule: {
          start: "계약 완료 후 즉시",
          milestones: ["착수 후 2주 차 데이터 취합 완료", "3주 차 리포트 생성 완료"],
          due: "착수일로부터 21일 이내",
        },
        qualRequired: [
          "문서 자동 생성 프로그램 개발 경험이 있는 자",
          "업력 1년 이상의 사업자만 지원 가능합니다",
        ],
        qualPreferred: ["교육 도메인 프로젝트 경험자 우대"],
        deliverables: ["소스 코드 원본"],
      },
      call: {
        title: "검수 확인 콜 — 클라이언트",
        date: "2024-05",
        summary: ["리포트 양식이 지점별로 상이할 가능성 사전 언급"],
        lines: [
          { t: "00:02", who: "장수룡 (위시켓)", text: "리포트 양식은 전 지점이 동일한가요?" },
          { t: "01:30", who: "클라이언트", text: "지점마다 조금씩 다를 수 있습니다." },
        ],
      },
    },
    issueLog: [
      { type: "이슈", date: "2024-07", src: "사전 미팅 — 개발사 G", text: "리포트 양식이 학원 지점별로 상이 — 표준 양식 확정 없이는 견적 범위 초과 우려 제기" },
    ],
    riskTags: ["요구 변경", "일정 압박"],
    qna: [],
    timeline: [
      { stage: "검수", date: "2024-05", title: "검수 완료", desc: "" },
      { stage: "계약", date: "2024-09", title: "중도 취소", desc: "취소 사유: 요구 양식 확정 지연으로 개발사 계약 포기", cancel: true },
    ],
  },
];

/** 완료 케이스 리뷰 체크리스트 항목 */
export const CHECK_ITEMS = [
  "리스크 사전 식별이 실제와 부합했는가",
  "예산 가이드가 최종 계약과 부합했는가",
  "과업 범위 변경이 관리 범위 내였는가",
  "유사 사례 참고가 상담에 도움이 되었는가",
];

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  { id: "n1", type: "status", projectId: "p1", text: "한빛보험서비스 OCR 증권분석 앱 — 상태가 모집 → 계약으로 변경되었습니다", time: "10분 전" },
  { id: "n2", type: "qna", projectId: "p8", text: "온누리헬스케어 프로젝트에 새 개발사 Q&A가 등록되었습니다", time: "32분 전" },
  { id: "n3", type: "status", projectId: "p3", text: "한올관광개발 프로젝트가 '진행' 단계로 전환되었습니다", time: "2시간 전" },
  { id: "n4", type: "qna", projectId: "p1", text: "한빛보험서비스 프로젝트에 새 개발사 Q&A가 2건 등록되었습니다", time: "어제" },
  { id: "n5", type: "status", projectId: "p2", text: "미래가구 프로젝트가 완료(취소)로 전환되었습니다", time: "2일 전" },
  { id: "n6", type: "status", projectId: "p4", text: "세진제조 MES 프로젝트 리뷰 작성이 완료되었습니다", time: "3일 전" },
];

/** 초기 저장된 리뷰 (p4 — 완료된 성공 케이스) */
export const MOCK_REVIEWS: Record<string, CaseReview> = {
  p4: {
    checks: [true, true, false, true],
    comment:
      "초기 요구 정의가 상세해 과업 범위 변경이 적었음. MES는 현장 인터뷰 일정을 검수 단계에 미리 잡는 것이 핵심.",
    savedAt: "06-12 14:20",
  },
};
