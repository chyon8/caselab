import { query } from "@/lib/db";

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

/**
 * 분류 원장과 공고별 원문 근거를 Neon target_demand_ledger에서 읽는다. 외부 API는 호출하지 않는다.
 * 원장은 scripts/target-demand-v2-*.mjs로 재생성하고 target-demand-v2-load.mjs로 적재한다.
 */
export async function getTargetDemandLedger() {
  const rows = await query<{
    project_id: string;
    unit_id: string;
    status: TargetDemandLedgerUnit["status"];
    industry: string | null;
    problem: string | null;
    system: string | null;
    industry_group: string | null;
    system_type: string | null;
    group_key: string | null;
    detail_key: string | null;
    reason: string | null;
    evidence_industry: string | null;
    evidence_problem: string | null;
    evidence_system: string | null;
  }>(
    `SELECT project_id::text, unit_id::text, status, industry, problem, system, industry_group, system_type,
            group_key, detail_key, reason, evidence_industry, evidence_problem, evidence_system
       FROM target_demand_ledger ORDER BY unit_id, project_id`,
  );
  const byUnit = new Map<string, TargetDemandLedgerUnit>();
  const evidence = new Map<string, TargetDemandEvidence>();
  for (const row of rows) {
    const unit = byUnit.get(row.unit_id);
    if (unit) unit.ids.push(row.project_id);
    else byUnit.set(row.unit_id, {
      unit: row.unit_id,
      ids: [row.project_id],
      status: row.status,
      industry: row.industry ?? undefined,
      problem: row.problem ?? undefined,
      system: row.system ?? undefined,
      industryGroup: row.industry_group ?? undefined,
      systemType: row.system_type ?? undefined,
      key: row.group_key ?? undefined,
      detailKey: row.detail_key ?? undefined,
      reason: row.reason ?? undefined,
    });
    if (row.evidence_industry !== null || row.evidence_problem !== null || row.evidence_system !== null) {
      evidence.set(row.project_id, {
        industry: row.evidence_industry ?? "",
        problem: row.evidence_problem ?? "",
        system: row.evidence_system ?? "",
      });
    }
  }
  return { units: [...byUnit.values()], evidence };
}
