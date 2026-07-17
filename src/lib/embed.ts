// 텍스트 1건을 projects.embedding과 같은 벡터 공간으로 임베딩한다.
// 모델·차원은 코퍼스 임베딩(scripts/embed-projects.mjs)과 반드시 일치해야 한다
// (text-embedding-3-large, dimensions:1536).

const MODEL = "text-embedding-3-large";
const DIMS = 1536;
const MAX_CHARS = 7000; // 토큰 한도(8191) 안전 여유

interface EmbedResponse {
  data?: { embedding: number[] }[];
}

/** 텍스트를 1536차원 임베딩 벡터로 변환한다. */
export async function embedText(text: string): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, dimensions: DIMS, input: text.slice(0, MAX_CHARS) }),
  });
  if (!res.ok) throw new Error(`임베딩 요청 실패: ${res.status}`);

  const j = (await res.json()) as EmbedResponse;
  const vec = j.data?.[0]?.embedding;
  if (!vec) throw new Error("임베딩 응답이 비어 있습니다.");
  return vec;
}
