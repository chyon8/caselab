import { dataSource } from "@/data/source";
import NonRecruitmentReport from "@/features/report/NonRecruitmentReport";
import { parsePeriod, periodDays } from "@/features/report/period";

export const dynamic = "force-dynamic";

/** 제출 후 미모집 사유 — 로그인한 계정 모두에게 공개(2026-10-01, 사용자 결정). 매니저 단위 표는 없다 */
export default async function NonRecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const period = parsePeriod((await searchParams).period);
  const stats = await dataSource.getNonRecruitmentStats(periodDays(period));
  return <NonRecruitmentReport stats={stats} period={period} />;
}
