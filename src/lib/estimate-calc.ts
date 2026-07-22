// 견적 계산 util (테스트) — prompt.md의 v1 단가표·공식을 그대로 코드로 옮긴 결정적 계산.
// LLM은 "기능 수량이 얼마나 되는가"만 판단하고, 산수(M/D·QA·PM·버퍼)는 여기서 고정 계산한다.
// LLM에게 다단계 산수를 시키면 같은 인풋도 숫자가 흔들리는 문제가 있어 분리했다.

export type Level = "L1" | "L2" | "L3";
export type Part = "plan" | "design" | "dev";
export type ProjectType = "일반 SW" | "임베디드 SW" | "R&D";

/** 파트별 난이도별 {M/D, 단가(만원/월)} — prompt.md Core Logic 2 표 그대로 */
const RATE_TABLE: Record<Part, Record<Level, { md: number; price: number }>> = {
  plan: { L1: { md: 0.25, price: 300 }, L2: { md: 0.5, price: 400 }, L3: { md: 1.0, price: 500 } },
  design: { L1: { md: 0.5, price: 300 }, L2: { md: 1.0, price: 400 }, L3: { md: 2.0, price: 500 } },
  dev: { L1: { md: 0.5, price: 400 }, L2: { md: 1.5, price: 700 }, L3: { md: 3.0, price: 1000 } },
};

const MD_PER_MM = 21; // 1 M/M = 21 M/D
const QA_RATIO = 0.15;
const QA_PRICE = 325; // 만원/M/M
const PM_RATIO = 0.15;
const PM_PRICE = 650; // 만원/M/M
const BUFFER = 1.1; // 최종 10% 버퍼
const EMBEDDED_DEV_MULTIPLIER = 1.3; // 임베딩 SW는 개발 파트 M/D·비용에만 적용
// R&D(연구/알고리즘) 작업 M/M 단가. prompt.md가 R&D 단가를 명시하지 않아 개발 최고난도(L3, 1000만/월)를
// 준용한 가정값이다 — R&D 견적을 다르게 잡으려면 이 상수만 바꾸면 된다.
const RND_PRICE = 1000; // 만원/M/M

/** 파트 하나의 난이도별 수량(개수) */
export type PartQty = Record<Level, number>;

export interface EstimateInput {
  projectType: ProjectType;
  qty: Record<Part, PartQty>;
  /** R&D 유형일 때 알고리즘·연구 작업의 사람월(M/M) 하한~상한. 결정성 비용 위에 범위로 가산된다. */
  rndMM?: { low: number; high: number };
}

interface PartResult {
  md: number;
  /** 만원 */
  cost: number;
}

export interface CostBreakdown {
  plan: PartResult;
  design: PartResult;
  dev: PartResult;
  qa: { mm: number; cost: number };
  pm: { mm: number; cost: number };
  /** 만원, 버퍼 전 (결정성 부분만) */
  subtotal: number;
  /** R&D 가산 금액(만원) 하한~상한. R&D 아니면 둘 다 0 */
  rnd: { low: number; high: number };
  /**
   * 만원, 최종 금액 하한~상한. 결정성부(버퍼10% 포함) + R&D 범위.
   * R&D가 아니면 low === high (단일 금액).
   */
  total: { low: number; high: number };
}

function calcPart(part: Part, qty: PartQty): PartResult {
  const rates = RATE_TABLE[part];
  let md = 0;
  let cost = 0;
  for (const level of ["L1", "L2", "L3"] as Level[]) {
    const n = Math.max(0, qty[level] || 0);
    const rate = rates[level];
    md += rate.md * n;
    cost += rate.md * n * (rate.price / MD_PER_MM);
  }
  return { md, cost };
}

/** qty(난이도별 기능 수량) + 프로젝트 유형 → 결정적 비용 산출 (prompt.md Core Logic 2 공식) */
export function calcCost({ projectType, qty, rndMM }: EstimateInput): CostBreakdown {
  const plan = calcPart("plan", qty.plan);
  const design = calcPart("design", qty.design);
  let dev = calcPart("dev", qty.dev);

  if (projectType === "임베디드 SW") {
    dev = { md: dev.md * EMBEDDED_DEV_MULTIPLIER, cost: dev.cost * EMBEDDED_DEV_MULTIPLIER };
  }

  const qaMM = (dev.md / MD_PER_MM) * QA_RATIO;
  const qaCost = qaMM * QA_PRICE;

  const pmMM = ((plan.md + design.md + dev.md) / MD_PER_MM + qaMM) * PM_RATIO;
  const pmCost = pmMM * PM_PRICE;

  const subtotal = plan.cost + design.cost + dev.cost + qaCost + pmCost;
  const base = subtotal * BUFFER; // 결정성부 버퍼 포함

  // R&D 유형이면 알고리즘 작업 M/M 범위를 비용 범위로 환산해 위에 얹는다(범위값 견적)
  const rndLow = projectType === "R&D" ? Math.max(0, rndMM?.low ?? 0) * RND_PRICE : 0;
  const rndHigh = projectType === "R&D" ? Math.max(0, rndMM?.high ?? 0) * RND_PRICE : 0;

  return {
    plan,
    design,
    dev,
    qa: { mm: qaMM, cost: qaCost },
    pm: { mm: pmMM, cost: pmCost },
    subtotal,
    rnd: { low: rndLow, high: rndHigh },
    total: { low: base + rndLow, high: base + rndHigh },
  };
}

/** 만원 단위 숫자를 "1,234만 원"으로 */
export function formatManwon(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}만 원`;
}
