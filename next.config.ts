import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // officeparser(첨부파일 텍스트 추출)는 tesseract.js 워커 스레드와 pdfjs를 런타임에
  // 파일 경로로 직접 로드한다. 번들에 넣으면 그 경로가 깨져("/ROOT/node_modules/…" 없음)
  // OCR 워커가 뜨지 않고 타임아웃까지 매달린다. 번들 대상에서 빼 node_modules에서 그대로 쓰게 한다.
  serverExternalPackages: ["officeparser", "tesseract.js", "pdfjs-dist"],
  // OCR 경로는 정적 분석으로 안 잡히는 파일이 둘 있어서 배포 번들에 직접 넣어줘야 한다.
  // ① @napi-rs/canvas — pdfjs-dist가 페이지 래스터화용으로 런타임 require하는 optionalDependency.
  //    트레이싱이 optional까지는 안 따라가 "Cannot find module '@napi-rs/canvas'"로 렌더링이 깨진다.
  // ② tesseract.js 워커 — worker_threads가 파일 "경로"로 띄우는 스크립트라 그 안의 require가
  //    정적으로 안 보인다. 그래서 worker-script/node/index.js만 들어가고 그게 부르는
  //    worker-script/index.js·tesseract.js-core(wasm)가 빠져 "Cannot find module '..'"로 죽는다.
  outputFileTracingIncludes: {
    "/api/extract-text": [
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**",
      "./node_modules/tesseract.js/**",
      "./node_modules/tesseract.js-core/**",
      "./node_modules/bmp-js/**",
      "./node_modules/is-url/**",
      "./node_modules/node-fetch/**",
      "./node_modules/regenerator-runtime/**",
      "./node_modules/wasm-feature-detect/**",
    ],
  },
};

export default nextConfig;
