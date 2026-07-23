// 견적 (테스트) — LLM은 "이 인풋이 어떤 프로젝트고, 옵션별로 기능이 몇 개(난이도별)나 되는지,
// 기간이 얼마나 걸리는지"만 판단한다. 산수(M/D·QA/PM·버퍼 계산)는 전부 src/lib/estimate-calc.ts가
// prompt.md의 단가표·공식 그대로 결정적으로 계산한다.
//
// 이렇게 나눈 이유: LLM에게 다단계 산수(M/D 합산 → QA/PM 비율 → 10% 버퍼)를 직접 시키면
// 같은 인풋도 결과 금액이 흔들린다(실측). 판단(수량 추정)은 LLM이, 계산은 코드가 — 다른 파이프라인
// (스코어링 등)과 같은 원칙.
//
// ⚠️ R&D 유형은 prompt.md상 "결정성 작업 + R&D 작업 M/M 범위 별도 산출·합산"이 필요한데,
// 이 테스트는 그 별도 R&D M/M 가산을 아직 구현하지 않았다 — R&D 프로젝트의 금액은 과소 산정될 수 있음.

import { calcCost, formatManwon, type ProjectType, type Part, type Level } from "./estimate-calc";

const MODEL = "gpt-4o-mini";

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

const OPTION_META = [
  { key: "A", name: "Standard (100%)", desc: "요구사항 100% 반영한 풀스펙" },
  { key: "B", name: "Value (80%)", desc: "L1/L2 편의 기능 삭제 + 외부 API 차용" },
  { key: "C", name: "Lean MVP (60%)", desc: "L3 고난도 로직 수동 전환 + AI 코딩 도입" },
  { key: "D", name: "Extreme (40%)", desc: "노코드/SaaS 결합 + 전면 수동화" },
] as const;

const PROMPT = `너는 20년 경력의 IT 개발 컨설턴트다. 아래 규칙에 따라 "판단"만 하고, 계산(비용 산출)은 하지 마라 — 숫자 계산은 별도 시스템이 한다.

# 판단할 것
1. 프로젝트 유형: "일반 SW" | "임베디드 SW" | "R&D" 중 하나와 그 이유.
2. 4단계 옵션(A Standard/B Value/C Lean MVP/D Extreme) 각각에 대해:
   - approach: 그 옵션의 구현 "방식"을 한 구절로. 한눈에 성격이 드러나게.
     (예: A "풀스펙 자동화 개발", B "핵심 기능 유지 + 외부 API 차용", C "코어만 구축 + 수동 운영 전환",
      D "노코드/SaaS 조합으로 최소 검증")
   - includedFeatures: 그 옵션에서 "실제로 구현·제공되는" 핵심 기능 3~5개(구체적 리스트).
   - excludedFeatures: 그 옵션에서 "빠지거나 수동/외부/노코드로 대체되는" 것 리스트.
     ★ 각 항목 끝에 대체 방식을 괄호로 밝혀라. (예: "실시간 정산 → 수동 엑셀 처리", "추천 알고리즘 → 제외",
     "결제 → 외부 PG 위젯 임베드", "관리자 대시보드 → 노코드(Retool) 구성"). A는 보통 빈 배열.
   - period: 예상 개발 기간, "N개월" 형식 (경험적 판단으로 추정, 계산하지 않는다)
   - qty: 기획/디자인/개발 각 파트별로, 난이도(L1/L2/L3)별 "실제 구현되는 기능·화면·API 개수"를
     현실적으로 추정한다. 상용 서비스 규모를 가정하여 전체 수량(보통 개발 파트 합계 30~100개 이상)을
     현실적으로 추정하라 — 고객이 언급한 것만 세면 절반토막 난 비현실적 견적이 나온다.
     고객이 명시하지 않은 숨은 필수 기능(관리자 백오피스, 결제/정산, 알림 등)도 반드시 포함해 세라.
   - Option B/C/D는 A보다 qty가 줄거나(L1/L2 삭제) L3 항목이 수동전환으로 빠지는 식으로 A와 달라야 한다.
     excludedFeatures에 적은 것과 qty 감소가 서로 일치해야 한다(무엇을 빼는지 말과 숫자가 맞아야 함).
   - rndMM: R&D 유형일 때만. 이 옵션의 알고리즘·연구 작업 사람월(M/M) 범위 { "low": n, "high": n }.
     R&D가 아니면 생략하거나 { "low": 0, "high": 0 }.
3. R&D 유형이면 C/D는 PoC(개념 검증) 제안으로 성격을 바꿔 서술하되 qty·rndMM은 동일 형식으로.

# 절대 규칙
- 근거 없는 억지 추정 금지. 그러나 상용 서비스 정상 작동에 필요한 숨은 요구사항은 전문가로서 반드시 반영.
- includedFeatures는 최소 3개.
- 비용(원 단위) 숫자는 절대 출력하지 마라. 오직 qty·period·rndMM만.

한국어. 아래 JSON으로만 답한다.
{
  "projectType": "일반 SW",
  "typeReason": "...",
  "options": [
    {
      "key": "A",
      "approach": "풀스펙 자동화 개발",
      "includedFeatures": ["...", "..."],
      "excludedFeatures": [],
      "period": "3개월",
      "qty": {
        "plan":   { "L1": 0, "L2": 0, "L3": 0 },
        "design": { "L1": 0, "L2": 0, "L3": 0 },
        "dev":    { "L1": 0, "L2": 0, "L3": 0 }
      },
      "rndMM": { "low": 0, "high": 0 }
    }
  ]
}
options는 반드시 A/B/C/D 4개를 모두 포함한다.`;

interface RawQty {
  L1?: number;
  L2?: number;
  L3?: number;
}
interface RawOption {
  key?: string;
  approach?: string;
  includedFeatures?: string[];
  excludedFeatures?: string[];
  period?: string;
  qty?: Partial<Record<Part, RawQty>>;
  rndMM?: { low?: number; high?: number };
}
interface RawEstimate {
  projectType?: string;
  typeReason?: string;
  options?: RawOption[];
}

export interface EstimateOption {
  key: string;
  name: string;
  desc: string;
  /** 구현 방식 한 구절 (예: "노코드/SaaS 조합") — 한눈에 성격 파악용 */
  approach: string;
  /** 실제 구현·제공되는 기능 */
  includedFeatures: string[];
  /** 빠지거나 수동/외부/노코드로 대체되는 것 (대체 방식 괄호 포함) */
  excludedFeatures: string[];
  period: string;
  cost: ReturnType<typeof calcCost>;
}

export interface EstimateResult {
  projectType: ProjectType;
  typeReason: string;
  options: EstimateOption[];
}

const PROJECT_TYPES: ProjectType[] = ["일반 SW", "임베디드 SW", "R&D"];

function toQty(raw: RawQty | undefined): Record<Level, number> {
  return {
    L1: Math.max(0, Math.round(raw?.L1 ?? 0)),
    L2: Math.max(0, Math.round(raw?.L2 ?? 0)),
    L3: Math.max(0, Math.round(raw?.L3 ?? 0)),
  };
}

/** 러프 인풋으로 견적을 산출한다. LLM은 수량·기간만 판단, 금액은 calcCost가 결정적으로 계산. */
export async function estimateInput(text: string): Promise<EstimateResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL,
      store: true,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `고객 요구사항:\n"""\n${text.slice(0, 12000)}\n"""` },
      ],
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { error?: { message?: string } };
      detail = err.error?.message ?? "";
    } catch {
      // 상태코드만 남긴다
    }
    throw new Error(`견적 요청 실패 (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  const j = (await res.json()) as ChatResponse;
  const out = j.choices?.[0]?.message?.content;
  if (!out) throw new Error("견적 결과가 비어 있습니다.");
  const raw = JSON.parse(out) as RawEstimate;

  const projectType: ProjectType = PROJECT_TYPES.includes(raw.projectType as ProjectType)
    ? (raw.projectType as ProjectType)
    : "일반 SW";

  const byKey = new Map<string, RawOption>();
  for (const o of raw.options ?? []) if (o.key) byKey.set(o.key, o);

  const strList = (arr: string[] | undefined) =>
    (arr ?? []).filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim());

  const options: EstimateOption[] = OPTION_META.map((meta) => {
    const r = byKey.get(meta.key);
    const qty = {
      plan: toQty(r?.qty?.plan),
      design: toQty(r?.qty?.design),
      dev: toQty(r?.qty?.dev),
    };
    const rndMM =
      projectType === "R&D"
        ? { low: Math.max(0, r?.rndMM?.low ?? 0), high: Math.max(0, r?.rndMM?.high ?? 0) }
        : undefined;
    return {
      key: meta.key,
      name: meta.name,
      desc: meta.desc,
      approach: typeof r?.approach === "string" ? r.approach.trim() : "",
      includedFeatures: strList(r?.includedFeatures),
      excludedFeatures: strList(r?.excludedFeatures),
      period: typeof r?.period === "string" && r.period.trim() !== "" ? r.period.trim() : "미정",
      cost: calcCost({ projectType, qty, rndMM }),
    };
  });

  return {
    projectType,
    typeReason: typeof raw.typeReason === "string" ? raw.typeReason.trim() : "",
    options,
  };
}

export { formatManwon };
