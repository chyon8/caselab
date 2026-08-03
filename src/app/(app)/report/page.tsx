import { dataSource } from "@/data/source";
import Report from "@/features/report/Report";

/** page.tsx와 동일 — DB를 읽는 페이지는 빌드 시점에 굽지 않는다 */
export const dynamic = "force-dynamic";

export default async function ReportPage() {
  // 집계는 SQL로 계산해서 받는다 — 5,998건을 브라우저로 실어나르지 않는다
  const stats = await dataSource.getReportStats();
  return <Report stats={stats} />;
}
