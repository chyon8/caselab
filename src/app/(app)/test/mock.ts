// /test 화면 오프라인 mock 번들 — Mock 모드 ON일 때 API 대신 이걸 즉시 보여준다.
// SAMPLE 인풋(반려동물 산책 매칭 앱) 하나에 대한 5개 결과를 손으로 고정.
// ★ repost의 body는 SAMPLE 원문 조각을 그대로 재배치한 것(워딩 불변 규칙 준수 예시).

import type { SimilarProject, ReviewTips } from "@/data/types";
import type { AskQuestion } from "@/lib/questions";
import type { ScoreResult } from "@/lib/scoring";
import { SECTIONS, assembleScore } from "@/lib/scoring";
import type { EstimateResult, EstimateOption } from "@/lib/estimate";
import { calcCost, type Level } from "@/lib/estimate-calc";
import type { RepostResult } from "@/lib/repost";
import type { BriefResult } from "@/lib/brief";
import { assembleBrief } from "@/lib/brief";
import type { DraftResult } from "@/lib/draft";
import { assembleDraft } from "@/lib/draft";
import type { CallRecord } from "@/lib/calls";
import { MOCK_PROJECTS } from "@/data/mock-data";

export const MOCK_TEXT =
  "반려동물 산책 매칭 앱을 만들고 싶어요. 견주가 산책 도우미를 지역·시간으로 찾아 예약하고, 산책 끝나면 사진이랑 경로를 받아봐요. 결제도 앱에서 하고요. 예산은 잘 모르겠고 최대한 빨리요.";

const MOCK_QUESTIONS: AskQuestion[] = [
  { text: "산책 도우미의 신원 확인·검증은 어떤 방식으로 하나요? (자격 심사, 보험 등)", purpose: "범위" },
  { text: "결제는 어떤 PG를 쓰고, 도우미 정산·수수료 정책은 어떻게 되나요?", purpose: "둘다" },
  { text: "예상 예산 범위가 전혀 없나요? 대략의 상한이라도 있으면 견적 방향이 잡힙니다.", purpose: "견적" },
  { text: "'최대한 빨리'가 구체적으로 몇 개월 안을 뜻하나요? 오픈 목표일이 있나요?", purpose: "둘다" },
  { text: "iOS/Android 둘 다인가요, 아니면 한쪽 먼저인가요?", purpose: "범위" },
];

// 12섹션 스코어 — SAMPLE이 러프해서 필수(features·platform)가 비어 gate 실패.
// 해당없음(applicable=false) 예시는 없다 — SAMPLE에 "그건 필요 없다"고 말한 문장이 없어서,
// 인용문 대조 규칙상 해당없음이 나올 수 없기 때문(mock이 실제 규칙을 어기면 안 됨).
const CONF: Record<string, { c: number; s: string }> = {
  purpose: { c: 72, s: "반려동물 산책 매칭 앱(견주↔산책 도우미 예약). 방향은 명확." },
  core_problem: { c: 15, s: "기존 운영방식·해결하려는 문제는 언급 없음." },
  features: { c: 55, s: "지역·시간 검색, 예약, 산책 후 사진·경로 전달, 인앱 결제." },
  admin: { c: 0, s: "" },
  users: { c: 20, s: "견주/도우미 양측이 있으나 규모·타겟 미언급." },
  platform: { c: 45, s: "'앱'으로만 언급 — iOS/Android/웹 범위 불명확." },
  integrations: { c: 40, s: "인앱 결제(PG 연동 필요) 정도만 암시." },
  design: { c: 0, s: "" },
  tech_stack: { c: 0, s: "" },
  budget: { c: 10, s: "'예산은 잘 모르겠고' — 사실상 미정." },
  timeline: { c: 15, s: "'최대한 빨리' — 구체 일정 없음." },
  deliverables: { c: 0, s: "" },
};

// 총점·게이트 산수는 실제 코드(assembleScore)로 — mock이 규칙을 따로 들고 있다가 어긋나지 않게
function buildScore(): ScoreResult {
  return assembleScore(
    {
      sections: SECTIONS.map((sec) => ({
        id: sec.id,
        confidence: CONF[sec.id].c,
        summary: CONF[sec.id].s,
      })),
      notes: ["'최대한 빨리' 표현 — 일정 압박 가능성. 킥오프 전 마감 합의 필요."],
    },
    MOCK_TEXT,
  );
}

// 견적 — 금액은 실제 calcCost로 결정적 계산(하드코딩 금액 대신)
type Qty = Record<Level, number>;
function opt(
  key: string,
  name: string,
  desc: string,
  approach: string,
  included: string[],
  excluded: string[],
  period: string,
  q: { plan: Qty; design: Qty; dev: Qty },
): EstimateOption {
  return {
    key,
    name,
    desc,
    approach,
    includedFeatures: included,
    excludedFeatures: excluded,
    period,
    cost: calcCost({ projectType: "일반 SW", qty: q }),
  };
}

function buildEstimate(): EstimateResult {
  return {
    projectType: "일반 SW",
    typeReason: "일반적인 O2O 매칭·예약 플랫폼으로 특수 하드웨어·연구 요소 없음.",
    options: [
      opt(
        "A",
        "Standard (100%)",
        "요구사항 100% 반영한 풀스펙",
        "풀스펙 자동화 개발",
        ["지역·시간 기반 도우미 검색/필터", "예약·일정 관리", "산책 경로 실시간 기록 + 사진 전송", "인앱 결제·자동 정산", "관리자 대시보드"],
        [],
        "4개월",
        { plan: { L1: 3, L2: 4, L3: 2 }, design: { L1: 4, L2: 5, L3: 1 }, dev: { L1: 5, L2: 8, L3: 4 } },
      ),
      opt(
        "B",
        "Value (80%)",
        "L1/L2 편의 기능 삭제 + 외부 API 차용",
        "핵심 기능 유지 + 외부 API 차용",
        ["도우미 검색/예약", "산책 후 사진 전송", "인앱 결제(외부 PG SDK)"],
        ["실시간 경로 기록 → 종료 시점 위치만 기록", "자동 정산 → PG 정산 리포트 수동 확인"],
        "3개월",
        { plan: { L1: 3, L2: 3, L3: 1 }, design: { L1: 4, L2: 3, L3: 0 }, dev: { L1: 5, L2: 6, L3: 2 } },
      ),
      opt(
        "C",
        "Lean MVP (60%)",
        "L3 고난도 로직 수동 전환 + AI 코딩 도입",
        "코어만 구축 + 수동 운영 전환",
        ["도우미 목록·예약 요청", "인앱 결제(외부 PG)"],
        ["실시간 경로/사진 → 채팅으로 수동 공유", "매칭 알고리즘 → 운영자 수동 배정"],
        "2개월",
        { plan: { L1: 2, L2: 2, L3: 0 }, design: { L1: 3, L2: 2, L3: 0 }, dev: { L1: 4, L2: 3, L3: 0 } },
      ),
      opt(
        "D",
        "Extreme (40%)",
        "노코드/SaaS 결합 + 전면 수동화",
        "노코드/SaaS 조합",
        ["예약 폼(노코드)", "결제 링크(외부 SaaS)"],
        ["앱 → 반응형 웹으로 대체", "정산·매칭 → 전면 수동 운영"],
        "1개월",
        { plan: { L1: 2, L2: 1, L3: 0 }, design: { L1: 2, L2: 0, L3: 0 }, dev: { L1: 3, L2: 1, L3: 0 } },
      ),
    ],
  };
}

// 유사사례 — 본진 mock 프로젝트 재사용 + 유사도만 부여
const MOCK_SIMS: SimilarProject[] = MOCK_PROJECTS.slice(0, 3).map((p, i) => ({
  ...p,
  similarity: [0.81, 0.74, 0.68][i],
}));

const MOCK_TIPS: ReviewTips = {
  sampleSize: 3,
  technicalNotes: [
    { text: "실시간 위치 추적은 배터리·정확도 이슈 — 백그라운드 위치 권한 정책 확인 필요", freq: 2 },
    { text: "PG 연동 시 도우미 정산 흐름(에스크로/직불)에 따라 개발량이 크게 갈림", freq: 3 },
  ],
  risks: [
    { text: "도우미 신원·안전 검증 부재 시 서비스 신뢰도·법적 리스크", freq: 2 },
    { text: "예산 미정 상태로 검수 통과 시 계약 단계 재협상 가능성", freq: 4 },
  ],
  questions: [
    { text: "취소·노쇼 정책과 환불 규정은?", freq: 3 },
    { text: "도우미 평가/리뷰 시스템이 초기 스코프에 포함되나?", freq: 2 },
  ],
  keywords: [
    { term: "매칭", count: 5 },
    { term: "결제", count: 4 },
    { term: "위치", count: 3 },
  ],
};

// SAMPLE 원문을 그대로 공고 양식에 재배치 — 워딩 불변 규칙의 정답 예시
const MISSING = "없음 · 확인 필요";
const MOCK_REPOST: RepostResult = {
  sections: [
    { heading: "추천 공고문 제목", body: MISSING },
    { heading: "프로젝트 키워드", body: MISSING },
    { heading: "프로젝트 개요", body: "반려동물 산책 매칭 앱을 만들고 싶어요." },
    { heading: "프로젝트 배경 및 목표", body: MISSING },
    {
      heading: "과업 범위",
      body:
        "1. 수행 범위\n" +
        "- 상세 기획: 없음 · 확인 필요\n" +
        "- UI/UX 디자인: 없음 · 확인 필요\n" +
        "- 프런트엔드/Client 개발: 없음 · 확인 필요\n" +
        "- 백엔드 개발: 없음 · 확인 필요\n" +
        "- 서버/DB/인프라 구성: 없음 · 확인 필요\n" +
        "2. 상세 기능 요구 사항\n" +
        "   2-1. 예약: 견주가 산책 도우미를 지역·시간으로 찾아 예약하고\n" +
        "   2-2. 산책 결과: 산책 끝나면 사진이랑 경로를 받아봐요.\n" +
        "   2-3. 결제: 결제도 앱에서 하고요.\n" +
        "3. 비기능적 요구사항\n" +
        "   3-1. 성능/규격: 없음 · 확인 필요\n" +
        "   3-2. 보안/인증: 없음 · 확인 필요",
    },
    { heading: "기술/제조 스택", body: MISSING },
    { heading: "클라이언트 준비 사항", body: MISSING },
    { heading: "주요 일정", body: "최대한 빨리요." },
    { heading: "지원 자격 및 우대 사항", body: MISSING },
    { heading: "산출물", body: MISSING },
    { heading: "계약 관련 특이 사항", body: "예산은 잘 모르겠고" },
  ],
};

// 브리핑 — 근거 대조(assembleBrief)를 실제로 통과시킨다. mock이 규칙을 우회하면
// "원문에 없는 인용은 버린다"는 규칙이 화면에서만 지켜지는 것처럼 보이게 되므로.
function buildBrief(): BriefResult {
  return assembleBrief(
    {
      oneLiner: "견주와 산책 도우미를 지역·시간으로 연결하는 반려동물 산책 매칭 앱",
      points: [
        "견주가 조건(지역·시간)으로 도우미를 찾아 예약하는 양방향 매칭 서비스",
        "산책 종료 후 사진·이동 경로를 견주에게 전달 — 위치 추적 기능이 필요",
        "결제를 앱 안에서 처리 (PG 연동 필요)",
        "예산 미정, 일정은 '최대한 빨리'로만 언급 — 둘 다 확정 필요",
      ],
      // 고객이 쓴 말만 올라온다 — assembleBrief가 인풋에 없는 용어는 버린다.
      terms: [
        {
          term: "견주",
          plain: "반려동물 주인. 이 서비스의 수요자 쪽이고, 도우미와 역할·화면이 완전히 갈리는 양방향 앱이라는 뜻이다.",
        },
        {
          term: "경로",
          plain: "산책 중 이동한 길. 사진과 달리 지도 위에 그려야 해서, 위치를 계속 기록·저장하는 구조가 필요해진다.",
        },
      ],
      // 고객이 말하지 않은 것들이 일부러 섞여 있다 — concepts는 인풋에 없는 말만 통과하는 항목이고,
      // "언급 안 된 것을 꺼내오는" 게 존재 이유다.
      concepts: [
        {
          term: "실시간 위치 추적 (GPS)",
          plain: "산책 경로를 지도에 그리려면 앱이 백그라운드에서 계속 위치를 받아야 한다. 배터리 소모·정확도·백그라운드 위치 권한 정책이 따라붙어 공수가 크게 갈리는 지점.",
        },
        {
          term: "PG 연동과 정산 구조",
          plain: "인앱 결제는 PG사 연동이 필요하고, 받은 돈을 도우미에게 나눠주는 방식(에스크로/직불/월정산)에 따라 개발량이 크게 달라진다. 고객은 아직 정산 얘기를 안 했다.",
        },
        {
          term: "푸시 알림",
          plain: "예약 수락·산책 시작/종료를 알리려면 필요하다. 고객이 언급하진 않았지만 이 유형에선 거의 필수로 따라오는 기능.",
        },
        {
          term: "앱스토어 심사",
          plain: "iOS/Android 출시는 심사 기간이 별도로 붙는다. '최대한 빨리'라는 일정 요구와 직접 충돌할 수 있는 요소.",
        },
      ],
    },
    MOCK_TEXT,
  );
}

// "통화 녹취 불러오기" mock — 실제로는 n8n 웹훅에서 온다. 필드·형식은 CallRecord와 동일
// (created_at은 실제 API처럼 타임존 없는 "YYYY-MM-DD HH:MM:SS" 문자열).
export const MOCK_CALLS: CallRecord[] = [
  {
    id: 9001,
    project_id: 155123,
    project_title: "반려동물 산책 매칭 앱",
    call_type: "out",
    call_time_secs: 612,
    summary:
      "결제는 인앱으로, 도우미 정산은 월 1회 일괄 지급으로 확정. 관리자 페이지는 필요 없다고 명시.",
    transcript:
      "매니저: 안녕하세요, 결제 방식 관련해서 여쭤보려고 연락드렸습니다. 고객: 네, 결제는 앱 안에서 바로 처리되면 좋겠고요, 도우미 쪽 정산은 매달 한 번에 몰아서 주는 걸로 하려고요. 매니저: 관리자 페이지 쪽은 별도로 필요하신가요? 고객: 아 그건 필요 없어요, 저희가 직접 엑셀로 관리할 거라서요.",
    drive_url: null,
    created_at: "2026-08-05 14:20:00",
  },
  {
    id: 9002,
    project_id: 155123,
    project_title: "반려동물 산책 매칭 앱",
    call_type: "in",
    call_time_secs: 240,
    summary: "오픈 목표는 3개월 내, iOS 우선 출시 후 Android 순차 진행으로 확인.",
    transcript:
      "매니저: 일정은 어느 정도로 보고 계신가요? 고객: 3개월 안에는 열고 싶어요. 처음엔 아이폰 앱만 먼저 내고, 안드로이드는 그 다음에 만들어도 될 것 같아요.",
    drive_url: null,
    created_at: "2026-08-05 14:45:00",
  },
];

// 공고문 draft — MOCK_TEXT + MOCK_CALLS 두 통화에서 확정된 내용이 반영된 상태.
// (통화에서 "관리자 페이지는 필요 없다", "3개월 내 iOS 우선", "월 1회 정산"이 나왔다)
const MOCK_DRAFT: DraftResult = assembleDraft({
  sections: [
    { heading: "추천 공고문 제목", body: "반려동물 산책 도우미 매칭 앱 개발" },
    { heading: "프로젝트 키워드", body: "O2O 매칭, 예약, 인앱 결제, 위치 기록, iOS" },
    {
      heading: "프로젝트 개요",
      body: "견주와 산책 도우미를 지역·시간 조건으로 연결하는 반려동물 산책 매칭 앱을 개발합니다.",
    },
    { heading: "프로젝트 배경 및 목표", body: MISSING },
    {
      heading: "과업 범위",
      body:
        "1. 수행 범위\n" +
        "- 지역·시간 조건 기반 산책 도우미 검색 및 예약\n" +
        "- 산책 종료 후 사진 및 이동 경로 전달\n" +
        "- 앱 내 결제 기능\n" +
        "- 도우미 정산 (월 1회 일괄 지급)\n" +
        "2. 제외 범위\n" +
        "- 관리자 페이지 (클라이언트가 자체 관리 예정)",
    },
    { heading: "기술/제조 스택", body: MISSING },
    { heading: "클라이언트 준비 사항", body: MISSING },
    {
      heading: "주요 일정",
      body: "오픈 목표: 3개월 이내\niOS 우선 출시 후 Android 순차 진행",
    },
    { heading: "지원 자격 및 우대 사항", body: MISSING },
    { heading: "산출물", body: MISSING },
    { heading: "계약 관련 특이 사항", body: "예산 미정 — 협의 필요" },
  ],
});

export interface TestBundle {
  text: string;
  brief: BriefResult;
  draft: DraftResult;
  questions: AskQuestion[];
  score: ScoreResult;
  estimate: EstimateResult;
  sims: SimilarProject[];
  tips: ReviewTips;
  repost: RepostResult;
}

export const MOCK_BUNDLE: TestBundle = {
  text: MOCK_TEXT,
  brief: buildBrief(),
  draft: MOCK_DRAFT,
  questions: MOCK_QUESTIONS,
  score: buildScore(),
  estimate: buildEstimate(),
  sims: MOCK_SIMS,
  tips: MOCK_TIPS,
  repost: MOCK_REPOST,
};
