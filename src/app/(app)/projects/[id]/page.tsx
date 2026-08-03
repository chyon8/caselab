import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dataSource } from "@/data/source";
import ProjectDetail from "@/features/projects/ProjectDetail";

// generateMetadata와 페이지 본문이 둘 다 같은 프로젝트를 조회하므로 요청 단위로 dedupe한다
const getProject = cache((id: string) => dataSource.getProject(id));

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getProject(id);
  return { title: project?.name ?? "프로젝트" };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [project, similar, similarStats] = await Promise.all([
    getProject(id),
    dataSource.getSimilarProjects(id, 5),
    dataSource.getSimilarStats(id),
  ]);
  if (!project) notFound();
  return <ProjectDetail project={project} similar={similar} similarStats={similarStats} />;
}
