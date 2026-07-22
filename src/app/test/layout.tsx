import type { Metadata } from "next";

// page.tsx가 client 컴포넌트라 metadata를 여기(서버 레이아웃)에서 대신 지정한다
export const metadata: Metadata = { title: "검수 스코어링 테스트" };

export default function TestLayout({ children }: { children: React.ReactNode }) {
  return children;
}
