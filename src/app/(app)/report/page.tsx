import { cookies } from "next/headers";
import { dataSource } from "@/data/source";
import { canSeeManagerStats } from "@/lib/auth/allowed-emails";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import Report from "@/features/report/Report";
import { parsePeriod, periodDays } from "@/features/report/period";

/** page.tsx와 동일 — DB를 읽는 페이지는 빌드 시점에 굽지 않는다 */
export const dynamic = "force-dynamic";

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const period = parsePeriod((await searchParams).period);
  const days = periodDays(period);

  // 매니저별 지표는 권한이 있을 때만 **조회한다**. 받아놓고 화면에서 숨기면
  // 서버가 그린 HTML과 RSC 페이로드에 그대로 실려 누구나 볼 수 있다.
  const session = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  const showManagers = canSeeManagerStats(session?.email);

  // 집계는 SQL로 계산해서 받는다 — 6,000건을 브라우저로 실어나르지 않는다.
  // 리포트는 열 때마다 다시 계산한다(스냅샷 테이블 없음). 대신 언제 기준 데이터인지
  // 마지막 동기화 시각을 같이 내려서, 따로 "갱신" 버튼을 두지 않는다.
  const [stats, lastSyncAt, managers] = await Promise.all([
    dataSource.getReportStats(days),
    dataSource.getLastSyncAt(),
    showManagers ? dataSource.getManagerStats(days) : Promise.resolve(null),
  ]);

  return <Report stats={stats} period={period} lastSyncAt={lastSyncAt} managers={managers} />;
}
