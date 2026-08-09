import { dataSource } from "@/data/source";
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

  // 집계는 SQL로 계산해서 받는다 — 6,000건을 브라우저로 실어나르지 않는다.
  // 리포트는 열 때마다 다시 계산한다(스냅샷 테이블 없음). 대신 언제 기준 데이터인지
  // 마지막 동기화 시각을 같이 내려서, 따로 "갱신" 버튼을 두지 않는다.
  const [stats, lastSyncAt] = await Promise.all([
    dataSource.getReportStats(periodDays(period)),
    dataSource.getLastSyncAt(),
  ]);

  return <Report stats={stats} period={period} lastSyncAt={lastSyncAt} />;
}
