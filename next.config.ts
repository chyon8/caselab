import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // officeparser(첨부파일 텍스트 추출)는 tesseract.js 워커 스레드와 pdfjs를 런타임에
  // 파일 경로로 직접 로드한다. 번들에 넣으면 그 경로가 깨져("/ROOT/node_modules/…" 없음)
  // OCR 워커가 뜨지 않고 타임아웃까지 매달린다. 번들 대상에서 빼 node_modules에서 그대로 쓰게 한다.
  serverExternalPackages: ["officeparser", "tesseract.js", "pdfjs-dist"],
  // 이미지 PDF OCR 시 pdfjs-dist가 페이지 래스터화용으로 @napi-rs/canvas(옵셔널 네이티브 바이너리)를
  // 런타임에 require한다. Vercel 파일 트레이싱이 optionalDependency까지는 자동으로 안 따라가서
  // 빠지고, 그 결과 "Cannot find module '@napi-rs/canvas'" 경고와 함께 OCR 렌더링이 깨진다.
  outputFileTracingIncludes: {
    "/api/extract-text": [
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**",
    ],
  },
};

export default nextConfig;
