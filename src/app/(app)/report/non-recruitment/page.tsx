import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { dataSource } from "@/data/source";
import { canSeeSubmissionConversion } from "@/lib/auth/allowed-emails";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import NonRecruitmentReport from "@/features/report/NonRecruitmentReport";
import { parsePeriod, periodDays } from "@/features/report/period";

export const dynamic = "force-dynamic";

/** 제출 후 미모집 사유 — 제출 전환과 같은 권한. 없는 계정은 404(조회도 하지 않는다) */
export default async function NonRecruitmentPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!canSeeSubmissionConversion(session?.email)) notFound();

  const period = parsePeriod((await searchParams).period);
  const stats = await dataSource.getNonRecruitmentStats(periodDays(period));
  return <NonRecruitmentReport stats={stats} period={period} />;
}
