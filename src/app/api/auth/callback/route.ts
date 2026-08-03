// 구글 리디렉션 수신 — 코드를 신원으로 바꾸고, 도메인을 확인한 뒤 세션 쿠키를 발급한다.

import { NextResponse, type NextRequest } from "next/server";
import { ALLOWED_EMAILS } from "@/lib/auth/allowed-emails";
import {
  ALLOWED_DOMAIN,
  OAUTH_COOKIE,
  exchangeCode,
  googleConfig,
  redirectUri,
} from "@/lib/auth/google";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function fail(req: NextRequest, reason: string): Response {
  const res = NextResponse.redirect(new URL(`/login?error=${reason}`, req.url));
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}

export async function GET(req: NextRequest): Promise<Response> {
  const config = googleConfig();
  if (!config) return fail(req, "config");

  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  if (!code) return fail(req, "google");

  // state 대조 — 쿠키에 심어둔 값과 같아야 우리가 시작한 로그인이다.
  const saved = req.cookies.get(OAUTH_COOKIE)?.value;
  if (!saved) return fail(req, "state");
  // 복귀 경로에 "|"가 섞일 수 있어 split이 아니라 첫 구분자 기준으로 자른다.
  const sep = saved.indexOf("|");
  const state = saved.slice(0, sep);
  const next = saved.slice(sep + 1);
  if (!state || state !== params.get("state")) return fail(req, "state");

  const identity = await exchangeCode(code, redirectUri(req), config);
  if (!identity) return fail(req, "google");
  if (!identity.emailVerified || identity.hd !== ALLOWED_DOMAIN) {
    return fail(req, "domain");
  }
  // 목록에 대문자가 섞여 들어와도 통과하도록 양쪽을 소문자로 맞춰 본다.
  const email = identity.email.toLowerCase();
  if (!ALLOWED_EMAILS.some((allowed) => allowed.trim().toLowerCase() === email)) {
    return fail(req, "allowlist");
  }

  const res = NextResponse.redirect(new URL(next || "/", req.url));
  res.cookies.set(
    SESSION_COOKIE,
    await signSession(identity.email, identity.name),
    sessionCookieOptions,
  );
  res.cookies.delete(OAUTH_COOKIE);
  return res;
}
