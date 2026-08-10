// 검수 내역 — 내가 진행한 검수 세션 목록. 다른 매니저 것은 보이지 않는다
// (listSessions가 manager_email로만 조회한다).
import { redirect } from "next/navigation";
import { currentManagerEmail, listSessions } from "@/lib/review-session";
import HistoryList from "./HistoryList";

export const dynamic = "force-dynamic";

export const metadata = { title: "검수 내역 · CaseLab" };

export default async function HistoryPage() {
  const email = await currentManagerEmail();
  if (!email) redirect("/login?next=/test/history");

  const sessions = await listSessions(email);
  return <HistoryList sessions={sessions} email={email} />;
}
