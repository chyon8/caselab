import { dataSource } from "@/data/source";
import ProjectList from "@/features/projects/ProjectList";

/** 15분마다 동기화되는 DB를 읽으므로 빌드 시점에 구우면 안 된다 (정적 생성 시 데이터가 영원히 고정됨) */
export const dynamic = "force-dynamic";

export default async function Home() {
  const projects = await dataSource.getProjects();
  return <ProjectList projects={projects} />;
}
