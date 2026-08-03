// 로그인 시작 — state를 쿠키에 심고 구글 동의화면으로 보낸다.

import { NextResponse } from "next/server";
import { OAUTH_COOKIE, authorizeUrl, googleConfig, redirectUri } from "@/lib/auth/google";

export const dynamic = "force-dynamic";

/** 로그인 후 돌아갈 경로. 외부 도메인으로 튕기는 오픈 리디렉트를 막는다. */
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(req: Request): Promise<Response> {
  const config = googleConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/login?error=config", req.url));
  }

  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const state = crypto.randomUUID();

  const res = NextResponse.redirect(
    authorizeUrl(config.clientId, redirectUri(req), state),
  );
  // state와 복귀 경로를 함께 보관 — 콜백에서 대조해 CSRF를 막는다.
  res.cookies.set(OAUTH_COOKIE, `${state}|${next}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
