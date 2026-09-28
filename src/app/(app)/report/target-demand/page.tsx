import { dataSource } from "@/data/source";
import TargetDemandReport from "@/features/report/TargetDemandReport";
import { parsePeriod, periodDays } from "@/features/report/period";

export const dynamic = "force-dynamic";

export default async function TargetDemandPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const period = parsePeriod((await searchParams).period);
  const stats = await dataSource.getTargetDemandStats(periodDays(period));
  return <TargetDemandReport stats={stats} period={period} />;
}
