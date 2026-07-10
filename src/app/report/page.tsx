import { dataSource } from "@/data/source";
import Report from "@/features/report/Report";

export default async function ReportPage() {
  const projects = await dataSource.getProjects();
  return <Report projects={projects} />;
}
