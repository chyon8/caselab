/**
 * Google OAuth 2.0 Authorization Code 흐름 — 라이브러리 없이 엔드포인트 2개만 쓴다.
 *
 * id_token 서명(JWKS) 검증을 생략하는 이유: 이 토큰은 브라우저를 거치지 않고 우리 서버가
 * client_secret으로 구글 토큰 엔드포인트에서 TLS로 직접 받아온 것이라 출처가 이미 보장된다.
 * (구글 공식 문서도 이 경우 검증 생략이 안전하다고 명시한다.) 대신 aud·email_verified·hd는 확인한다.
 */

import { decodeBase64UrlText } from "./session";

/** 로그인 허용 도메인 — 구글 id_token의 hd 클레임과 대조한다. 외부 협업자를 넣으려면 여기를 고친다. */
export const ALLOWED_DOMAIN = "wishket.com";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const OAUTH_COOKIE = "caselab_oauth";

interface GoogleConfig {
  clientId: string;
  clientSecret: string;
}

export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/**
 * 구글에 등록한 "승인된 리디렉션 URI"와 문자 단위로 같아야 한다.
 * 배포본은 AUTH_URL을 고정으로 넣는다(프리뷰마다 호스트가 바뀌면 구글이 거부).
 */
export function redirectUri(req: Request): string {
  const base = process.env.AUTH_URL ?? new URL(req.url).origin;
  return `${base.replace(/\/$/, "")}/api/auth/callback`;
}

export function authorizeUrl(clientId: string, redirect: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: "code",
    scope: "openid email profile",
    state,
    // 계정 선택 화면을 강제 — 개인 계정으로 로그인돼 있을 때 조용히 실패하는 걸 막는다
    prompt: "select_account",
    // 구글 로그인 화면에 도메인 힌트만 주는 값. 실제 차단은 서버(hd 검증)가 한다.
    hd: ALLOWED_DOMAIN,
  });
  return `${AUTHORIZE_ENDPOINT}?${params}`;
}

export interface GoogleIdentity {
  email: string;
  name: string;
  hd: string | null;
  emailVerified: boolean;
}

interface IdTokenClaims {
  email?: string;
  name?: string;
  hd?: string;
  aud?: string;
  email_verified?: boolean;
}

/** 인가 코드 → 사용자 신원. 실패하면 null. */
export async function exchangeCode(
  code: string,
  redirect: string,
  config: GoogleConfig,
): Promise<GoogleIdentity | null> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirect,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;

  const { id_token: idToken } = (await res.json()) as { id_token?: string };
  const payload = idToken?.split(".")[1];
  if (!payload) return null;

  let claims: IdTokenClaims;
  try {
    claims = JSON.parse(decodeBase64UrlText(payload)) as IdTokenClaims;
  } catch {
    return null;
  }

  if (claims.aud !== config.clientId || !claims.email) return null;
  return {
    email: claims.email,
    name: claims.name ?? claims.email,
    hd: claims.hd ?? null,
    emailVerified: claims.email_verified === true,
  };
}
