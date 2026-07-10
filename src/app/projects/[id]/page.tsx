import { notFound } from "next/navigation";
import { dataSource } from "@/data/source";
import ProjectDetail from "@/features/projects/ProjectDetail";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await dataSource.getProject(id);
  if (!project) notFound();
  return <ProjectDetail project={project} />;
}
