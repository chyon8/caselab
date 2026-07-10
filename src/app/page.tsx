import { dataSource } from "@/data/source";
import ProjectList from "@/features/projects/ProjectList";

export default async function Home() {
  const projects = await dataSource.getProjects();
  return <ProjectList projects={projects} />;
}
