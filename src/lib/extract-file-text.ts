// 공고문 검색 첨부파일 텍스트 추출 — word/pdf/excel/ppt를 텍스트로 변환해
// 기존 공고문 붙여넣기 검색(normalizePosting → embedText) 입력에 그대로 얹는다.
// 파싱은 라이브러리(officeparser)가 결정적으로 처리하므로 AI 비용이 들지 않는다.

// 이름 있는 export(OfficeParser)는 Turbopack의 CJS 인터롭에서 undefined로 깨진다
// (getter로 정의된 export를 초기값 스냅샷으로 읽는 버그) — default export는 정상 동작해 이걸 쓴다.
import OfficeParser, { type OfficeContentNode, type SupportedFileType } from "officeparser";

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

/**
 * OCR 폴백 상한. 페이지 1장당 ~3.5초 + 원본 해상도 비트맵(장당 10MB대)을 메모리에 올리므로
 * 장수가 많으면 함수 타임아웃·메모리 초과로 이어진다. 통째로 실패시키는 대신 미리 거절한다.
 */
const OCR_MAX_PAGES = 15;

/**
 * 이미지·스캔 PDF를 tesseract로 읽는다. 결과는 페이지 이미지별 ocrText에 담기므로
 * ast.to("text")가 아니라 attachments를 모아야 한다(본문 변환엔 "[Image: ...]"만 남는다).
 *
 * 인식 품질은 완벽하지 않다(제목·장식 글꼴이 특히 약함). 다만 이 텍스트는 사람이 읽는 게 아니라
 * normalizePosting → 임베딩으로 흘러가고, 그 과정에서 노이즈가 상당 부분 정리된다.
 */
async function ocrPdf(filename: string, buffer: Buffer, pageCount: number): Promise<ExtractedFile> {
  if (pageCount > OCR_MAX_PAGES) {
    return {
      filename,
      text: "",
      error: `이미지로만 된 ${pageCount}쪽 PDF예요. 글자를 읽으려면 이미지 인식이 필요한데 ${OCR_MAX_PAGES}쪽까지만 지원해요 — 내용을 복사해 붙여넣어 주세요.`,
    };
  }

  const ast = await OfficeParser.parseOffice(buffer, {
    fileType: "pdf",
    ocr: true,
    // ocrText는 attachments에만 실린다 — 이 옵션이 없으면 OCR 자체가 돌지 않는다
    extractAttachments: true,
    ocrConfig: {
      language: "kor+eng",
      // 첫 실행 때 한글 학습데이터(수십 MB)를 내려받으므로 로딩 타임아웃을 넉넉히 준다
      timeout: { workerLoad: 180000, recognition: 120000, autoTerminate: 5000 },
    },
  });

  const text = (ast.attachments ?? [])
    .map((a) => (a.ocrText ?? "").trim())
    .filter((t) => t !== "")
    .join("\n\n");

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
