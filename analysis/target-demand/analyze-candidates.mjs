// 공고 내용 기반 타깃 후보의 규칙 분류·성과 집계.
// 원문을 먼저 분류하고, 아래 결과 집계 단계에서만 outcomes.json을 결합한다.
// 사용: node analysis/target-demand/analyze-candidates.mjs
import crypto from "node:crypto";
import fs from "node:fs";

const DIR = new URL("./", import.meta.url);
const DAY = 86_400_000;
const Z = 1.959963984540054;

const corpus = JSON.parse(fs.readFileSync(new URL("corpus.json", DIR), "utf8"));
const outcomes = JSON.parse(fs.readFileSync(new URL("outcomes.json", DIR), "utf8"));

function includesAll(text, expressions) {
  return expressions.every((expression) => expression.test(text));
}

function matchCount(text, expressions) {
  return expressions.filter((expression) => expression.test(text)).length;
}

function isUsableText(text) {
  const trimmed = text.trim();
  if (trimmed.length < 120 || trimmed === "프로젝트 상세 내용을 입력해주세요.") return false;
  // 실제 응답 없이 입력 폼의 예시만 남은 공고는 업종을 판독할 수 없다.
  return !(trimmed.includes("의뢰 배경, 달성하려는 목적/목표를 알려주세요. [예시]") && trimmed.length < 1300);
}

// 후보는 업종과 구체 운영 흐름이 원문에 모두 드러난 경우에만 포함한다.
// 넓은 결과물 태그(앱, 홈페이지, AI 등)는 판단 조건으로 쓰지 않는다.
const CANDIDATES = [
  {
    id: "commerce-order-fulfillment",
    label: "온라인 판매사업자의 다채널 주문·재고·출고 통합 관리 시스템",
    subject: "자사몰·오픈마켓 등 온라인 판매사업자",
    problem: "여러 판매 채널의 주문, 재고, 발주·송장·출고 또는 정산을 수기·엑셀로 처리함",
    system: "채널 API 연동 기반 주문·재고·출고 관리 시스템",
    include(text) {
      return includesAll(text, [
        /쇼핑몰|오픈마켓|자사몰|판매 채널|온라인 판매|셀러|스마트스토어|카페24|Shopify/,
        /API|자동|수기|엑셀|연동|통합/,
      ]) && matchCount(text, [
        /주문.*(수집|관리|연동|자동)/,
        /재고.*(관리|연동|동기화)/,
        /발주.*(관리|자동|연동)/,
        /송장.*(등록|출력|자동|연동)/,
        /출고.*(관리|자동|연동)/,
        /정산.*(관리|자동|리포트)/,
      ]) >= 2;
    },
    exclude(text) {
      return /쇼핑몰 (구축|디자인)|브랜드 홈페이지|상품 상세 페이지/.test(text);
    },
  },
  {
    id: "freight-dispatch-operations",
    label: "화물·포워딩·운송 사업자의 배차·운송 진행 관리 시스템",
    subject: "물류·운송",
    problem: "배차, 운행·상하차·배송 진행, 운송 증빙 또는 운임·정산이 분산·수작업으로 처리됨",
    system: "운송 운영용 웹·앱·관리 시스템",
    include(text) {
      return includesAll(text, [
        /화물|화주|운송사|운송업|운수업|포워딩|수입화물|물류 현장|물류사/,
        /배차|운송장|운임|운행|하역|운송비|배송 상태|운송 모니터링/,
      ]);
    },
    exclude(text) {
      // 차량 일반 서비스와 쇼핑몰의 단순 배송 언급은 물류 운영 수요가 아니다.
      return !/화물|화주|운송사|운송업|운수업|포워딩|수입화물|물류 현장|물류사/.test(text)
        || /쇼핑몰|Shopify|온라인 채널|렌탈 상품|비철금속|차량 이동/.test(text);
    },
  },
  {
    id: "manufacturing-production-quality",
    label: "제조 현장의 생산·품질·설비 기록 및 관리 시스템",
    subject: "제조 현장",
    problem: "생산·검사·불량·설비 또는 자재 흐름을 수기·엑셀·분산 데이터로 관리함",
    system: "생산·품질·설비 관리 시스템(MES·현장 앱·대시보드 포함)",
    include(text) {
      return includesAll(text, [
        /제조업체|제조업|제조사입니다|제조사로|현지 공장|공장.*(생산|제조|라인)|생산 현장/,
        /생산 관리|품질 관리|공정 관리|MES|불량|설비 관리|작업지시|가동율|생산 수량/,
      ]);
    },
    exclude(text) {
      return /PCBA|회로·PCB|회로 설계|PCB 설계|RFP.*양식/.test(text);
    },
  },
  {
    id: "manufacturing-erp-planning",
    label: "제조사의 수주·자재·생산계획 통합 ERP/MES",
    subject: "제조사·공장",
    problem: "수주·BOM·자재·생산계획·출하가 엑셀 또는 노후 시스템에 분산됨",
    system: "제조 ERP/MES 또는 생산계획 통합 시스템",
    include(text) {
      return includesAll(text, [
        /제조업체|제조업|제조사입니다|제조사로|현지 공장|공장.*(생산|제조|라인)|생산 현장/,
        /ERP|MES|BOM|생산계획|작업지시|자재.*관리/,
      ]);
    },
    exclude(text) {
      return /PCBA|회로·PCB|회로 설계|PCB 설계|RFP.*양식/.test(text);
    },
  },
  {
    id: "provider-record-integration",
    label: "의료 제공기관의 환자 기록·접수·검사 연동 자동화",
    subject: "병원·의원·치과·약국 등 의료 제공기관",
    problem: "환자 정보·접수·진료·검사·청구가 기존 전산 또는 별도 프로그램에 분산됨",
    system: "전자차트/접수/검사 프로그램 연동 및 업무 자동화",
    include(text) {
      return includesAll(text, [
        /병원 내부|본원|병·의원|의료기관|약국|치과 데스크|상급병원|협력병원|안과/,
        /전자차트|EMR|접수 프로그램|진료 기록|환자 정보|처방전|검사 프로그램|요양정보/,
      ]);
    },
    exclude(text) {
      // 환자 대상 소비자 앱·의료 콘텐츠만인 경우는 의료기관 내부 운영 타깃에서 제외한다.
      return !/접수|전자차트|EMR|진료|환자 정보|처방|검사 프로그램|청구/.test(text)
        || /비대면 진료 플랫폼|뷰티|미용|의료관광|기업 홈페이지|보호자 웹서비스/.test(text);
    },
  },
  {
    id: "academy-parent-operations",
    label: "학원·교육기관의 학생 출결·성적·학부모 소통 운영 시스템",
    subject: "학원·교육기관",
    problem: "학생 출결·성적·통학 또는 학부모 소통을 분산·수기 처리함",
    system: "학원 관리자 웹과 학생·학부모·강사용 운영 시스템",
    include(text) {
      return includesAll(text, [
        /학원|교육기관|스터디카페/,
        /출결|학부모|통학 차량|성적표/,
      ]);
    },
    exclude(text) {
      return /학원 홈페이지|강의 판매|교육 콘텐츠 제작/.test(text);
    },
  },
  {
    id: "academy-learning-operations",
    label: "학원의 학생 학습이력·오답·상담 관리 시스템",
    subject: "학원·교육기관",
    problem: "학생별 문제풀이·오답·상담 이력을 인력 중심 또는 분산 데이터로 관리함",
    system: "학생·강사용 학습 및 상담 관리 시스템",
    include(text) {
      return includesAll(text, [
        /학원|교육기관/,
        /오답|문제 풀이|학습 이력|학습 관리|상담 데이터/,
      ]);
    },
    exclude(text) {
      return /학원 홈페이지|강의 판매|교육 콘텐츠 제작/.test(text);
    },
  },
  {
    id: "franchise-pos-consolidation",
    label: "프랜차이즈 본사의 가맹점 POS 판매데이터 통합 시스템",
    subject: "프랜차이즈 본사·가맹점",
    problem: "가맹점별 POS 주문·판매 데이터가 제각각이라 본사가 통합 수집·분석하지 못함",
    system: "POS 연동 기반 본사 통합 관리 시스템",
    include(text) {
      return includesAll(text, [
        /프랜차이즈|가맹점|가맹본부/,
        /POS/,
        /본사|통합|매장별|판매 데이터|주문 데이터/,
      ]);
    },
    exclude() {
      return false;
    },
  },
];

function normalizedText(text) {
  return text.trim().replace(/\s+/g, " ");
}

function hashText(text) {
  return crypto.createHash("sha256").update(normalizedText(text)).digest("hex");
}

function pct(value) {
  return Math.round(value * 1000) / 10;
}

function wilson(successes, total) {
  if (!total) return null;
  const p = successes / total;
  const z2 = Z ** 2;
  const denominator = 1 + z2 / total;
  const center = (p + z2 / (2 * total)) / denominator;
  const half = (Z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total)) / denominator;
  return [pct(center - half), pct(center + half)];
}

function recruitment14(row, asOf) {
  const submitted = new Date(row.submitted_at).getTime();
  if (asOf - submitted < 14 * DAY || row.raw_status === "close_recruiting") return null;
  if (!row.recruited_at) return false;
  const elapsed = new Date(row.recruited_at).getTime() - submitted;
  return elapsed >= 0 && elapsed <= 14 * DAY;
}

function contractAfter(row, anchor, asOf) {
  const start = new Date(anchor).getTime();
  if (asOf - start < 90 * DAY) return null;
  if (!row.first_contract_date_reference_only) return false;
  const elapsed = new Date(row.first_contract_date_reference_only).getTime() - start;
  return elapsed >= 0 && elapsed <= 90 * DAY;
}

function rate(rows, measure) {
  const observed = rows.map(measure).filter((value) => value !== null);
  const successes = observed.filter(Boolean).length;
  return {
    observed: observed.length,
    successes,
    rate_pct: observed.length ? pct(successes / observed.length) : null,
    ci95_pct: wilson(successes, observed.length),
  };
}

function candidateComparison(candidateRows, allRows, measure) {
  const candidateIds = new Set(candidateRows.map((row) => row.anon_id));
  const candidate = rate(candidateRows, measure);
  const strata = new Map();
  for (const row of candidateRows) {
    const outcome = measure(row);
    if (outcome === null) continue;
    const key = `${row.month}|${row.source}`;
    const stratum = strata.get(key) ?? { candidate: [], control: [] };
    stratum.candidate.push(outcome);
    strata.set(key, stratum);
  }
  for (const row of allRows) {
    if (candidateIds.has(row.anon_id)) continue;
    const outcome = measure(row);
    if (outcome === null) continue;
    const key = `${row.month}|${row.source}`;
    const stratum = strata.get(key);
    if (stratum) stratum.control.push(outcome);
  }
  const observedCandidate = [...strata.values()].reduce((sum, stratum) => sum + stratum.candidate.length, 0);
  const usableStrata = [...strata.values()].filter((stratum) => stratum.control.length > 0);
  const comparisonRate = usableStrata.reduce((sum, stratum) => (
    sum + (stratum.candidate.length / observedCandidate)
      * (stratum.control.filter(Boolean).length / stratum.control.length)
  ), 0);
  const comparisonVariance = usableStrata.reduce((sum, stratum) => {
    const weight = stratum.candidate.length / observedCandidate;
    const p = stratum.control.filter(Boolean).length / stratum.control.length;
    return sum + weight ** 2 * p * (1 - p) / stratum.control.length;
  }, 0);
  const candidateP = candidate.observed ? candidate.successes / candidate.observed : null;
  const difference = candidateP === null ? null : candidateP - comparisonRate;
  const comparisonLow = Math.max(0, comparisonRate - Z * Math.sqrt(comparisonVariance));
  const comparisonHigh = Math.min(1, comparisonRate + Z * Math.sqrt(comparisonVariance));
  const candidateWilson = candidate.ci95_pct?.map((value) => value / 100) ?? null;
  const comparison = {
    observed: usableStrata.reduce((sum, stratum) => sum + stratum.control.length, 0),
    successes: null,
    rate_pct: pct(comparisonRate),
    ci95_pct: null,
  };
  return {
    candidate,
    matched_month_source_comparison: comparison,
    difference_pp: difference === null ? null : pct(difference),
    // Wilson 후보 구간과 층화 비교군 구간을 빼는 보수적 구간이다.
    // n이 매우 작거나 성공 0건이어도 정상 근사보다 과도하게 좁아지지 않는다.
    difference_ci95_pp: difference === null || !candidateWilson
      ? null
      : [pct(candidateWilson[0] - comparisonHigh), pct(candidateWilson[1] - comparisonLow)],
  };
}

const usableCorpus = corpus.filter((row) => isUsableText(row.text));
const outcomeById = new Map(outcomes.map((row) => [row.anon_id, row]));
const asOf = Math.max(...outcomes.map((row) => new Date(row.source_extracted_at).getTime()));
const rows = usableCorpus.map((row) => ({ ...row, ...outcomeById.get(row.anon_id) }));

const results = CANDIDATES.map((candidate) => {
  const matches = rows.filter((row) => candidate.include(row.text) && !candidate.exclude(row.text));
  const uniqueTexts = new Set(matches.map((row) => hashText(row.text)));
  const recruitedWithin14 = (row) => recruitment14(row, asOf);
  const contractWithin90FromSubmission = (row) => contractAfter(row, row.submitted_at, asOf);
  const contractWithin90FromRecruitment = (row) => row.recruited_at
    ? contractAfter(row, row.recruited_at, asOf)
    : null;

  return {
    id: candidate.id,
    definition: {
      target: candidate.label,
      subject: candidate.subject,
      problem: candidate.problem,
      system: candidate.system,
      inclusion: "업종 표현과 해당 운영 흐름 표현이 모두 원문에 명시된 공고",
      exclusion: "업종 또는 운영 흐름이 한쪽만 언급된 공고, 일반 차량/쇼핑몰 배송 언급, 환자 대상 소비자 서비스만인 공고",
    },
    count: matches.length,
    unique_text_count: uniqueTexts.size,
    months: Object.fromEntries([...new Set(matches.map((row) => row.month))].sort().map((month) => [month, matches.filter((row) => row.month === month).length])),
    metrics: {
      recruited_within_14_days: candidateComparison(matches, rows, recruitedWithin14),
      contracted_within_90_days_from_submission: candidateComparison(matches, rows, contractWithin90FromSubmission),
      contracted_within_90_days_from_recruitment: candidateComparison(matches.filter((row) => row.recruited_at), rows, contractWithin90FromRecruitment),
    },
    // 원문 대조를 위한 가명 ID만 저장한다. 보고서에는 식별자를 쓰지 않는다.
    anon_ids: matches.map((row) => row.anon_id),
  };
});

fs.mkdirSync(new URL("generated/", DIR), { recursive: true });
fs.writeFileSync(new URL("generated/candidate-screening.json", DIR), `${JSON.stringify({
  generated_at: new Date().toISOString(),
  as_of: new Date(asOf).toISOString(),
  corpus: { total: corpus.length, usable_text: rows.length },
  candidates: results,
}, null, 2)}\n`);

console.log(JSON.stringify(results.map((candidate) => ({
  id: candidate.id,
  count: candidate.count,
  unique_text_count: candidate.unique_text_count,
  recruitment: candidate.metrics.recruited_within_14_days.candidate,
})), null, 2));
