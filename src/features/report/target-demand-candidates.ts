export interface TargetDemandCandidateDefinition {
  id: string;
  title: string;
  industry: string;
  problem: string;
  system: string;
  inclusion: string;
  exclusion: string;
  pattern: string;
}

/** 성과를 보기 전에 원문에서 먼저 고정한 후보 정의. 업종·문제·시스템을 한 세트로 유지한다. */
export const TARGET_DEMAND_CANDIDATES: TargetDemandCandidateDefinition[] = [
  {
    id: "manufacturing-production-quality",
    title: "제조 생산·품질·설비 운영",
    industry: "제조업·생산현장",
    problem: "생산량·검사·불량·설비 상태를 수기나 분산된 데이터로 관리",
    system: "생산관리·품질관리·설비관리·MES 시스템",
    inclusion: "제조사·공장·생산라인과 생산·품질·불량·설비 업무가 함께 명시된 공고",
    exclusion: "제품 설계·PCB·펌웨어처럼 제조 운영 시스템이 아닌 개발",
    pattern: "((제조|공장|생산라인|제조사|제조업|산업용).{0,240}(생산|품질|불량|설비|mes|검사|작업지시)|(생산|품질|불량|설비|mes|검사).{0,240}(제조|공장|생산라인))",
  },
  {
    id: "manufacturing-erp-materials",
    title: "제조 ERP·자재·생산계획",
    industry: "제조업·생산현장",
    problem: "수주·BOM·자재·생산계획·발주를 엑셀 또는 여러 시스템에서 따로 관리",
    system: "제조 ERP·MRP·자재·생산계획 통합 시스템",
    inclusion: "제조·공장 주체와 ERP·BOM·자재·MRP·생산계획·발주가 함께 명시된 공고",
    exclusion: "일반 기업용 ERP 소개나 단순 재고·쇼핑몰 관리",
    pattern: "(제조|공장|생산|제조업).{0,240}(erp|bom|mrp|자재|생산계획|작업지시|발주)",
  },
  {
    id: "medical-records-integration",
    title: "의료기관 기록·접수·검사 연동",
    industry: "병원·의원·약국·치과",
    problem: "환자·접수·진료·검사·처방 데이터가 분산되어 반복 입력과 수작업이 발생",
    system: "전자차트·접수·검사 연동·의료 업무 시스템",
    inclusion: "의료기관 주체와 환자·진료·접수·검사·처방·청구 흐름이 함께 명시된 공고",
    exclusion: "의료 콘텐츠·건강 커뮤니티처럼 의료기관 운영 문제가 아닌 서비스",
    pattern: "(병원|의원|치과|약국|피부과|의료기관).{0,240}(전자차트|접수|환자|진료|검사|처방|청구|진단)",
  },
  {
    id: "academy-attendance-communication",
    title: "학원 출결·성적·학부모 소통",
    industry: "학원·교육기관",
    problem: "학생 출결·성적·통학·학부모 안내를 수기 또는 여러 도구로 처리",
    system: "학원 운영·출결·성적표·학부모 소통 시스템",
    inclusion: "학원·교육기관과 출결·성적·학부모·통학 업무가 함께 명시된 공고",
    exclusion: "강의 콘텐츠 제작·교육 홈페이지·단순 동영상 플랫폼",
    pattern: "(학원|교육기관|스터디카페|학교).{0,240}(출결|성적|학부모|통학|등하원)",
  },
  {
    id: "academy-learning-history",
    title: "학원 학습이력·오답·상담",
    industry: "학원·교육기관",
    problem: "학생별 문제풀이·오답·질문·상담 이력이 분산되어 학습 관리가 어려움",
    system: "학습이력·오답·채점·상담 관리 시스템",
    inclusion: "학원·교육기관과 오답·문제풀이·학습이력·채점·상담이 함께 명시된 공고",
    exclusion: "출결만 관리하거나 강의 판매·소개만 하는 공고",
    pattern: "(학원|교육기관|학교).{0,240}(오답|문제풀이|학습이력|학습관리|상담|채점)",
  },
  {
    id: "logistics-dispatch-operations",
    title: "화물·운송 배차·운행 관리",
    industry: "물류·운송·화물",
    problem: "배차·운행·상하차·배송상태·운임·증빙을 분산 또는 수기로 관리",
    system: "TMS·배차·운송관제·화물추적 시스템",
    inclusion: "화물·운송사·포워딩 등 주체와 배차·운행·배송·운임 업무가 함께 명시된 공고",
    exclusion: "일반 차량 서비스나 쇼핑몰의 단순 배송 기능",
    pattern: "(물류|화물|운송사|운송|포워딩|선사|택배).{0,240}(배차|운행|배송상태|운임|상하차|화물추적|tms)",
  },
  {
    id: "seller-order-inventory-integration",
    title: "온라인 판매자의 주문·재고·출고 통합",
    industry: "온라인 판매·유통·커머스",
    problem: "여러 판매 채널의 주문·재고·발주·송장·출고·정산을 엑셀과 수작업으로 처리",
    system: "쇼핑몰·오픈마켓 주문·재고·출고 통합 시스템",
    inclusion: "온라인 판매 주체와 주문·재고·발주·송장·출고·정산 중 두 업무 이상이 명시된 공고",
    exclusion: "상품 소개·단일 쇼핑몰·결제 기능만 필요한 신규 구축",
    pattern: "(쇼핑몰|이커머스|온라인 판매|셀러|오픈마켓|유통|리테일).{0,240}(주문|재고|발주|송장|출고|정산).{0,240}(주문|재고|발주|송장|출고|정산)",
  },
  {
    id: "internal-workflow-automation",
    title: "기업 내부 반복업무·문서 자동화",
    industry: "기업 내부 업무",
    problem: "엑셀·메일·수기 승인에 의존해 반복 입력과 업무 이력 관리가 발생",
    system: "업무자동화·전자결재·사내 ERP·CRM 시스템",
    inclusion: "사내·내부 업무와 엑셀·수기·반복·승인·인사·근태·ERP·CRM 문제가 함께 명시된 공고",
    exclusion: "외부 고객 대상 플랫폼이나 단순 홈페이지·랜딩페이지",
    pattern: "(사내|내부|기업|업무).{0,240}(엑셀|수기|반복|자동화|전자결재|인사|근태|업무관리|erp|crm)",
  },
];
