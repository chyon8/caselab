import type { Metadata } from "next";
import { ALLOWED_DOMAIN } from "@/lib/auth/google";
import styles from "./Login.module.css";

export const metadata: Metadata = { title: "로그인" };

const ERRORS: Record<string, string> = {
  domain: `@${ALLOWED_DOMAIN} 계정만 접근할 수 있습니다. 계정을 바꿔 다시 시도해 주세요.`,
  allowlist: "접근 권한이 없는 계정입니다.",
  state: "로그인 요청이 만료됐습니다. 다시 시도해 주세요.",
  google: "구글 로그인에 실패했습니다. 다시 시도해 주세요.",
  config: "서버에 구글 OAuth 설정이 없습니다. 관리자에게 문의해 주세요.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const href = next ? `/api/auth/google?next=${encodeURIComponent(next)}` : "/api/auth/google";

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>CaseLab</div>
        <p className={styles.subtitle}>위시켓 프로젝트 인텔리전스 대시보드</p>

        {error && <p className={styles.error}>{ERRORS[error] ?? ERRORS.google}</p>}

        <a className={styles.button} href={href}>
          Google 계정으로 로그인
        </a>
        <p className={styles.hint}>@{ALLOWED_DOMAIN} 계정만 접근할 수 있습니다.</p>
      </div>
    </main>
  );
}
