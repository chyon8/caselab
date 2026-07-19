import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // officeparser·pdfjs-dist·@napi-rs/canvas(네이티브 바이너리)는 런타임에 파일 경로로 직접
  // 로드한다. 번들에 넣으면 그 경로가 깨진다. 번들 대상에서 빼 node_modules에서 그대로 쓰게 한다.
  serverExternalPackages: ["officeparser", "pdfjs-dist", "@napi-rs/canvas"],
  // @napi-rs/canvas는 pdfjs-dist/우리 코드(BMP→PNG 재인코딩) 둘 다에서 쓰는 optionalDependency라
  // Next 파일 트레이싱이 안 따라간다 — 없으면 "Cannot find module '@napi-rs/canvas'"로 깨진다.
  outputFileTracingIncludes: {
    "/api/extract-text": [
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**",
    ],
  },
};

export default nextConfig;
