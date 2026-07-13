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
