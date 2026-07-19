// 공고문 검색 첨부파일 텍스트 추출 — word/pdf/excel/ppt를 텍스트로 변환해
// 기존 공고문 붙여넣기 검색(normalizePosting → embedText) 입력에 그대로 얹는다.
// 파싱은 라이브러리(officeparser)가 결정적으로 처리하므로 AI 비용이 들지 않는다.
// 단, 이미지로만 된(텍스트 레이어 없는) PDF는 OpenAI 비전 모델로 읽는다(ocrPdf, 파일 하단).

// 이름 있는 export(OfficeParser)는 Turbopack의 CJS 인터롭에서 undefined로 깨진다
// (getter로 정의된 export를 초기값 스냅샷으로 읽는 버그) — default export는 정상 동작해 이걸 쓴다.
import OfficeParser, { type OfficeContentNode, type SupportedFileType } from "officeparser";
import { createCanvas, loadImage } from "@napi-rs/canvas";

const EXT_TO_FILE_TYPE: Record<string, SupportedFileType> = {
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
  pdf: "pdf",
};

/** 옛 바이너리 형식 — officeparser 미지원. 최신 형식으로 저장해서 다시 올려달라고 안내 */
const LEGACY_OFFICE_EXT = new Set(["doc", "xls", "ppt"]);

/** 한글 워드프로세서 — 신뢰할 만한 무료 파서가 없어 1차 버전에서는 미지원 */
const HWP_EXT = new Set(["hwp", "hwpx"]);

export interface ExtractedFile {
  filename: string;
  text: string;
  error?: string;
}

function extOf(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  return m ? m[1].toLowerCase() : "";
}

/**
 * sheet 노드는 자신의 text가 비어 있다(officeparser가 container에 집계해 넣지 않음) —
 * row → cell 자식을 직접 훑어 탭으로 셀을, 줄바꿈으로 행을 이어붙인다.
 */
function sheetText(sheet: OfficeContentNode): string {
  const rows = (sheet.children ?? []).filter((n) => n.type === "row");
  const lines = rows
    .map((row) =>
      (row.children ?? [])
        .filter((c) => c.type === "cell")
        .map((c) => (c.text ?? "").trim())
        .filter((t) => t !== "")
        .join("\t"),
    )
    .filter((line) => line !== "");
  return lines.join("\n");
}

/** xlsx는 시트별로 구분해서 텍스트를 만든다 — 시트 하나가 다른 주제(견적/일정 등)인 경우가 많아 뭉치면 신호가 흐려진다 */
function xlsxTextBySheet(content: OfficeContentNode[]): string | null {
  const sheets = content.filter((n) => n.type === "sheet");
  if (sheets.length === 0) return null;
  const blocks = sheets
    .map((s) => ({ name: s.metadata?.sheetName ?? "시트", text: sheetText(s) }))
    .filter((s) => s.text !== "");
  if (blocks.length === 0) return "";
  return blocks.map((s) => `[${s.name}]\n${s.text}`).join("\n\n");
}

/** 파싱 결과에서 본문 텍스트를 뽑는다. xlsx만 시트 구분을 살리고 나머지는 라이브러리 기본 변환을 쓴다 */
async function astText(
  ast: Awaited<ReturnType<typeof OfficeParser.parseOffice>>,
  fileType: SupportedFileType,
): Promise<string> {
  if (fileType === "xlsx") {
    const bySheet = xlsxTextBySheet(ast.content);
    if (bySheet !== null) return bySheet;
  }
  const { value } = await ast.to("text");
  return value.trim();
}

/** OCR 폴백 상한 — 페이지마다 OpenAI 비전 호출 1회(병렬)라 비용·지연을 여기서 미리 방어한다. */
const OCR_MAX_PAGES = 15;

/** 이보다 작은(가로·세로 모두) 이미지는 본문 스캔이 아니라 로고·아이콘 같은 장식 요소로 보고 건너뛴다 */
const OCR_MIN_IMAGE_PX = 150;

/** officeparser가 PDF 이미지를 뽑을 때 항상 BMP로 인코딩하는데, OpenAI 비전 API는 BMP를 지원하지 않아 PNG로 바꿔준다 */
async function bmpToPng(base64Bmp: string): Promise<{ base64Png: string; width: number; height: number }> {
  const image = await loadImage(Buffer.from(base64Bmp, "base64"));
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext("2d").drawImage(image, 0, 0);
  return { base64Png: canvas.toBuffer("image/png").toString("base64"), width: image.width, height: image.height };
}

/** 이미지 한 장의 텍스트를 그대로 전사한다. 사람이 읽는 게 아니라 검색 임베딩 입력으로만 쓰이므로 서식은 필요 없다 */
async function visionTranscribe(base64Png: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "이 이미지에 보이는 모든 텍스트를 있는 그대로 전사해줘. 설명이나 요약 없이 텍스트만 출력해." },
            { type: "image_url", image_url: { url: `data:image/png;base64,${base64Png}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OCR 요청 실패: ${res.status}`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (j.choices?.[0]?.message?.content ?? "").trim();
}

/**
 * 이미지·스캔 PDF를 페이지별로 읽는다. officeparser의 extractAttachments(ocr 없이)로
 * 페이지 이미지만 뽑고, 인식은 OpenAI 비전 모델에 맡긴다.
 *
 * tesseract.js 대신인 이유: 워커스레드+wasm+CDN 한글 학습데이터가 Vercel 서버리스
 * 트레이싱과 계속 부딪혔다(모듈 누락 → 고쳐도 콜드스타트 다운로드로 타임아웃). 이 경로는
 * officeparser가 이미지만 뽑을 때 tesseract를 아예 로드하지 않아(lazy import) 그 문제 전체가 없어진다.
 */
async function ocrPdf(filename: string, buffer: Buffer, pageCount: number): Promise<ExtractedFile> {
  if (pageCount > OCR_MAX_PAGES) {
    return {
      filename,
      text: "",
      error: `이미지로만 된 ${pageCount}쪽 PDF예요. 글자를 읽으려면 이미지 인식이 필요한데 ${OCR_MAX_PAGES}쪽까지만 지원해요 — 내용을 복사해 붙여넣어 주세요.`,
    };
  }

  const ast = await OfficeParser.parseOffice(buffer, { fileType: "pdf", extractAttachments: true });

  const pageTexts = await Promise.all(
    (ast.attachments ?? []).map(async (a): Promise<string> => {
      try {
        const { base64Png, width, height } = await bmpToPng(a.data);
        if (width < OCR_MIN_IMAGE_PX || height < OCR_MIN_IMAGE_PX) return "";
        return await visionTranscribe(base64Png);
      } catch {
        return "";
      }
    }),
  );

  const text = pageTexts.filter((t) => t !== "").join("\n\n");
  if (text === "") {
    return {
      filename,
      text: "",
      error: "이미지로만 된 PDF인데 글자를 인식하지 못했어요 — 내용을 복사해 붙여넣어 주세요.",
    };
  }
  return { filename, text };
}

export async function extractFileText(filename: string, buffer: Buffer): Promise<ExtractedFile> {
  const ext = extOf(filename);

  if (HWP_EXT.has(ext)) {
    return {
      filename,
      text: "",
      error: "한글(.hwp) 파일은 아직 지원하지 않아요. 내용을 복사해 텍스트로 붙여넣어 주세요.",
    };
  }
  if (LEGACY_OFFICE_EXT.has(ext)) {
    return {
      filename,
      text: "",
      error: "옛 형식(.doc/.xls/.ppt)은 지원하지 않아요. 최신 형식(.docx/.xlsx/.pptx)으로 저장 후 다시 올려주세요.",
    };
  }
  const fileType = EXT_TO_FILE_TYPE[ext];
  if (!fileType) {
    return { filename, text: "", error: `지원하지 않는 파일 형식이에요 (.${ext || "?"}).` };
  }

  try {
    const ast = await OfficeParser.parseOffice(buffer, { fileType });

    const text = await astText(ast, fileType);
    if (text !== "") return { filename, text };

    // 파싱은 성공했는데 글자가 하나도 없는 경우 = 텍스트 레이어가 없는 이미지·스캔 PDF.
    // 이때만 OCR로 재시도한다(폴백). 일반 PDF는 이 경로를 타지 않아 OCR 비용을 안 치른다.
    if (fileType === "pdf") return ocrPdf(filename, buffer, ast.content.length);
    return { filename, text: "", error: "파일에서 읽을 수 있는 글자가 없어요." };
  } catch (e) {
    return {
      filename,
      text: "",
      error: e instanceof Error ? e.message : "파일을 읽는 중 문제가 발생했습니다.",
    };
  }
}
