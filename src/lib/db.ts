import { neon } from "@neondatabase/serverless";

type Client = ReturnType<typeof neon>;

let client: Client | null = null;

/** DATABASE_URL이 없는 환경(mock 모드)에서 빌드가 깨지지 않도록 지연 생성한다. */
function db(): Client {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL이 설정되지 않았습니다.");
    client = neon(url);
  }
  return client;
}

export async function query<T>(text: string, params: unknown[] = []): Promise<T[]> {
  const rows = await db().query(text, params);
  return rows as unknown as T[];
}

/** 여러 문장을 한 트랜잭션으로 커밋 — 전부 성공하거나 전부 롤백 */
export async function transaction(
  stmts: { text: string; params?: unknown[] }[],
): Promise<void> {
  const c = db();
  // neon http 드라이버의 query()는 지연 실행 — transaction()에 넘겨야 한 요청으로 묶인다
  await c.transaction(stmts.map((s) => c.query(s.text, s.params ?? [])));
}
