/**
 * 전역 인증 게이트 (Next 16에서 middleware의 새 이름이 proxy다).
 *
 * **deny-by-default** — 아래 PUBLIC_PREFIXES 외의 모든 경로는 세션 쿠키가 있어야 통과한다.
 * 라우트를 새로 추가해도 자동으로 보호되고, 뚫으려면 여기 목록을 명시적으로 고쳐야 한다.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

const PUBLIC_PREFIXES = [
  "/login",
  "/api/auth/",
  // n8n → CaseLab 데이터 푸시. X-CaseLab-Key로 자체 인증한다(src/lib/sync/auth.ts).
  "/api/sync/",
  // Vercel Cron. Authorization: Bearer CRON_SECRET으로 자체 인증한다.
  "/api/cron/",
];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  // API는 리디렉트하면 fetch 쪽에서 HTML을 받아 파싱 에러가 난다 — 401로 끊는다.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const login = req.nextUrl.clone();
  login.search = "";
  login.pathname = "/login";
  login.searchParams.set("next", pathname + req.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // 정적 자산만 제외하고 나머지 전부 — 페이지·API·RSC 요청이 모두 여기를 지난다.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
