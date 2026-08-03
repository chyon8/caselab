/**
 * 로그인 세션 — HMAC-SHA256으로 서명한 쿠키 하나. 서버에 세션 저장소를 두지 않는다.
 *
 * 토큰 형식: base64url(JSON payload) + "." + base64url(HMAC-SHA256(AUTH_SECRET, payload))
 * Web Crypto만 써서 proxy(Edge/Node 양쪽)와 서버 컴포넌트에서 똑같이 동작한다.
 */

export const SESSION_COOKIE = "caselab_session";

/** 세션 유효기간 30일 */
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

export interface Session {
  email: string;
  /** 구글 프로필 이름 (사이드바 표시용) */
  name: string;
  /** 만료 시각 (epoch 초) */
  exp: number;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** base64url → 문자열. 한글 이름이 깨지지 않도록 UTF-8로 디코드한다(atob 결과를 그대로 쓰면 깨짐). */
export function decodeBase64UrlText(s: string): string {
  return new TextDecoder().decode(fromBase64Url(s));
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET이 설정되지 않았습니다.");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signSession(email: string, name: string): Promise<string> {
  const session: Session = {
    email,
    name,
    exp: Math.floor(Date.now() / 1000) + MAX_AGE_SEC,
  };
  const payload = toBase64Url(encoder.encode(JSON.stringify(session)));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(), encoder.encode(payload));
  return `${payload}.${toBase64Url(new Uint8Array(sig))}`;
}

/** 서명·만료가 모두 유효하면 세션, 아니면 null. 예외를 던지지 않는다(호출부가 전부 게이트라). */
export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(),
      fromBase64Url(sig),
      encoder.encode(payload),
    );
    if (!valid) return null;

    const session = JSON.parse(decodeBase64UrlText(payload)) as Session;
    if (typeof session.exp !== "number" || session.exp < Date.now() / 1000) return null;
    if (typeof session.email !== "string" || !session.email) return null;
    return session;
  } catch {
    return null;
  }
}

/** Set-Cookie 옵션 — 로그인 시 세션 발급용 */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: MAX_AGE_SEC,
} as const;
