import { dataSource } from "@/data/source";
import Report from "@/features/report/Report";

/** page.tsx와 동일 — DB를 읽는 페이지는 빌드 시점에 굽지 않는다 */
export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const projects = await dataSource.getProjects();
  return <Report projects={projects} />;
}
