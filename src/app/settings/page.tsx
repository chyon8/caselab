import Settings from "@/features/settings/Settings";

/** 이 페이지 자체는 DB를 안 읽지만 루트 레이아웃이 리뷰를 읽는다 — 정적으로 구우면 그것도 함께 박제된다 */
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return <Settings />;
}
