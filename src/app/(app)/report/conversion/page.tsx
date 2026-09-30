import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { dataSource } from "@/data/source";
import { canSeeSubmissionConversion } from "@/lib/auth/allowed-emails";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import SubmissionConversionReport from "@/features/report/SubmissionConversionReport";
import { parsePeriod, periodDays } from "@/features/report/period";

export const dynamic = "force-dynamic";

/** 제출→모집 전환 — 권한 없는 계정은 페이지 자체가 없는 것처럼 404(조회도 하지 않는다) */
export default async function ConversionPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!canSeeSubmissionConversion(session?.email)) notFound();

  const period = parsePeriod((await searchParams).period);
  const stats = await dataSource.getSubmissionConversionStats(periodDays(period));
  return <SubmissionConversionReport stats={stats} period={period} />;
}
