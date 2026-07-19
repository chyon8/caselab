import { extractFileText } from "@/lib/extract-file-text";

/**
 * 이미지 PDF는 페이지 이미지를 병렬로 OpenAI 비전 모델에 보내 읽는다(ocrPdf).
 * 페이지 수와 무관하게 가장 느린 호출 1건 정도의 시간이지만, 네트워크 여유를 넉넉히 둔다.
 */
export const maxDuration = 60;

/** 한 요청에서 처리할 파일 수 상한 — 과도한 동시 파싱으로 함수가 타임아웃되는 것을 막는다 */
const MAX_FILES = 10;
/** 파일 1개 크기 상한(바이트) — Vercel 서버리스 함수 요청 본문 한도(기본 4.5MB) 안에서 여러 파일을 받기 위한 보수적 값 */
const MAX_FILE_BYTES = 4 * 1024 * 1024;

/**
 * POST /api/extract-text — 공고문 검색 첨부파일(word/pdf/excel/ppt) 텍스트 추출.
 * multipart/form-data의 files[] 필드를 받아 파일별로 { filename, text, error? }를 돌려준다.
 * 결과는 저장하지 않는다 — 프런트가 postingText에 이어붙여 기존 검색 흐름을 그대로 탄다.
 */
export async function POST(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "파일을 첨부해주세요." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return Response.json({ error: `한 번에 최대 ${MAX_FILES}개까지 첨부할 수 있어요.` }, { status: 400 });
  }

  const results = await Promise.all(
    files.map(async (file) => {
      if (file.size > MAX_FILE_BYTES) {
        return {
          filename: file.name,
          text: "",
          error: `파일이 너무 커요(최대 ${MAX_FILE_BYTES / 1024 / 1024}MB).`,
        };
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      return extractFileText(file.name, buffer);
    }),
  );

  return Response.json({ results });
}
