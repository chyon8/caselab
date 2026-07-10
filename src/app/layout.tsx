import type { Metadata } from "next";
import { Inter } from "next/font/google";
import AppShell from "@/components/AppShell";
import { dataSource } from "@/data/source";
import { AppProvider } from "@/state/AppContext";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "CaseLab",
  description: "위시켓 프로젝트 인텔리전스 대시보드",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [notifications, reviews] = await Promise.all([
    dataSource.getNotifications(),
    dataSource.getReviews(),
  ]);

  return (
    <html lang="ko" className={inter.variable}>
      <body>
        <AppProvider notifications={notifications} initialReviews={reviews}>
          <AppShell>{children}</AppShell>
        </AppProvider>
      </body>
    </html>
  );
}
