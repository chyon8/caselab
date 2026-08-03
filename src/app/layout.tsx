import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: { template: "%s · CaseLab", default: "CaseLab" },
  description: "위시켓 프로젝트 인텔리전스 대시보드",
};

// 루트는 껍데기만 — 앱 데이터(알림·리뷰)는 (app) 그룹 레이아웃에서 가져온다.
// 로그인 전 화면(/login)에 프로젝트 데이터가 딸려 내려가지 않게 하기 위한 분리다.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
