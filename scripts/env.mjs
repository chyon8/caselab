// .env.local에서 값 하나를 읽는다.
// 원래는 각 스크립트가 env.match(/OPENAI_API_KEY=(.*)/)로 읽었는데,
// match()는 파일에서 처음 걸리는 줄을 잡고 정규식은 '#'을 모른다 —
// 주석 처리해 둔 옛 키로 800건을 돌린 사고가 실제로 있었다(2026-08-12).
// 줄머리에서만 찾고, 없거나 여러 줄이면 조용히 넘어가지 않고 던진다.
import fs from "fs";

const ENV_PATH = new URL("../.env.local", import.meta.url);

export function readEnv(name) {
  const hits = fs
    .readFileSync(ENV_PATH, "utf8")
    .split("\n")
    .filter((line) => line.startsWith(`${name}=`))
    .map((line) => line.slice(name.length + 1).trim());

  if (hits.length === 0) throw new Error(`.env.local에 ${name}이 없다`);
  if (hits.length > 1) throw new Error(`.env.local에 ${name}이 ${hits.length}줄 있다 — 쓸 것만 남겨라`);
  if (!hits[0] || hits[0].startsWith("#")) throw new Error(`.env.local의 ${name} 값이 비었다`);
  return hits[0];
}
