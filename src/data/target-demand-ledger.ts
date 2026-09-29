import fs from "node:fs";
import path from "node:path";

/** 원문 판독으로 확정한 고유 수요 1건. 재등록·분할 공고는 ids에 함께 묶인다. */
export interface TargetDemandLedgerUnit {
  /** 대표 공고 id (묶인 공고 중 결과가 가장 앞선 공고) */
  unit: string;
  ids: string[];
  status: "group" | "single" | "ambiguous" | "excluded";
  industry?: string;
  problem?: string;
  system?: string;
  industryGroup?: string;
  systemType?: string;
  /** "업종군 × 시스템 유형" — 같은 key면 같은 타깃 그룹 */
  key?: string;
  /** 세부 표기 "업종 × 업무 × 시스템" */
  detailKey?: string;
  reason?: string;
}

export interface TargetDemandEvidence {
  industry: string;
  problem: string;
  system: string;
}

let cached: { units: TargetDemandLedgerUnit[]; evidence: Map<string, TargetDemandEvidence> } | undefined;

/**
 * 분류 원장과 공고별 원문 근거를 읽는다. 외부 API는 호출하지 않는다.
 * 원장은 scripts/target-demand-v2-*.mjs로 재생성하며, 파일이 없으면 빈 결과를 돌려준다.
 */
export function getTargetDemandLedger() {
  if (cached) return cached;
  const dir = path.join(process.cwd(), ".private", "target-demand");
  const ledgerFile = path.join(dir, "v2", "ledger.json");
  const extractionFile = path.join(dir, "extractions.jsonl");
  if (!fs.existsSync(ledgerFile)) return { units: [], evidence: new Map<string, TargetDemandEvidence>() };

  const units = JSON.parse(fs.readFileSync(ledgerFile, "utf8")) as TargetDemandLedgerUnit[];
  const evidence = new Map<string, TargetDemandEvidence>();
  if (fs.existsSync(extractionFile)) {
    for (const line of fs.readFileSync(extractionFile, "utf8").split("\n").filter(Boolean)) {
      const row = JSON.parse(line) as { id: string; result?: { eligible?: boolean; evidence?: TargetDemandEvidence } };
      if (row.result?.eligible && row.result.evidence) evidence.set(row.id, row.result.evidence);
    }
  }
  cached = { units, evidence };
  return cached;
}
