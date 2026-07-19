import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // officeparser(첨부파일 텍스트 추출)는 tesseract.js 워커 스레드와 pdfjs를 런타임에
  // 파일 경로로 직접 로드한다. 번들에 넣으면 그 경로가 깨져("/ROOT/node_modules/…" 없음)
  // OCR 워커가 뜨지 않고 타임아웃까지 매달린다. 번들 대상에서 빼 node_modules에서 그대로 쓰게 한다.
  serverExternalPackages: ["officeparser", "tesseract.js", "pdfjs-dist"],
};

export default nextConfig;
