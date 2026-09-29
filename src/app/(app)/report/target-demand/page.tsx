import { dataSource } from "@/data/source";
import { parseDemandView } from "@/features/report/DemandViewTabs";
import SubmissionPatternReport from "@/features/report/SubmissionPatternReport";
import TargetDemandReport from "@/features/report/TargetDemandReport";
import { parsePeriod, periodDays } from "@/features/report/period";

export const dynamic = "force-dynamic";

export default async function TargetDemandPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; view?: string }>;
}) {
  const params = await searchParams;
  if (parseDemandView(params.view) === "submission") return <SubmissionPatternReport />;
  const period = parsePeriod(params.period);
  const stats = await dataSource.getTargetDemandStats(periodDays(period));
  return <TargetDemandReport stats={stats} period={period} />;
}
