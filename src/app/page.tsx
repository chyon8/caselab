import { dataSource } from "@/data/source";
import { DEFAULT_PAGE_SIZE } from "@/data/postgres";
import ProjectList from "@/features/projects/ProjectList";

/** 15분마다 동기화되는 DB를 읽으므로 빌드 시점에 구우면 안 된다 (정적 생성 시 데이터가 영원히 고정됨) */
export const dynamic = "force-dynamic";

export default async function Home() {
  // 첫 페이지만 서버에서 미리 그린다(SSR). 이후 필터·페이지 변경은 클라이언트가 /api/projects로 이어받는다.
  const initial = await dataSource.getProjects({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  return <ProjectList initial={initial} pageSize={DEFAULT_PAGE_SIZE} />;
}
