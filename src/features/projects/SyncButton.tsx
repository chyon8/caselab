"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./SyncButton.module.css";

// kind: idle=평상시(마지막 동기화 시각 표시) / loading=요청 중 / note=요청 보냄(완료는 미확인) / err=요청 자체 실패
type State = { kind: "idle" | "loading" | "note" | "err"; msg?: string };

/** last_run_at(ISO) → "7.24 10:01" (KST). 없으면 null */
function formatKst(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
const sleep = (n: number) => new Promise((r) => setTimeout(r, n));
const POLL_INTERVAL = 3000;
const POLL_MAX = 8; // 3s × 8 = 최대 24초만 완료(시각 전진)를 지켜본다

/**
 * 홈 상단 수동 동기화 버튼.
 *
 * n8n 은 Cloudflare Access 뒤라 서버(Vercel)에서 트리거하면 IP 기반으로 막혀 403. 그래서
 * "Access 에 신뢰된 사용자 브라우저"가 웹훅을 직접 POST 한다(URL 은 서버 GET 이 내려줌).
 * no-cors 라 응답을 못 읽는다. 지원수 리프레시 API가 별도 완료 시각을 항상 기록하므로:
 *   - 트리거를 보내고 잠깐(≤24초) 지원수 완료 시각이 오르나 지켜본다.
 *   - 오르면 서버 컴포넌트를 새로고침하고, 안 올라도 "요청됨"으로 끝낸다.
 *   - 거짓 "실패"는 띄우지 않는다(브라우저는 트리거 성공/차단을 판별할 수 없다).
 */
export default function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [proposalCountsLastRunAt, setProposalCountsLastRunAt] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);

  // cache:"no-store" 필수 — 없으면 브라우저가 이 GET 을 캐싱해 last_run_at 이 옛 값으로 고정된다.
  async function fetchLast(): Promise<{
    lastRunAt: string | null;
    proposalCountsLastRunAt: string | null;
  } | null> {
    try {
      const res = await fetch("/api/admin/sync", { cache: "no-store" });
      const data = (await res.json()) as {
        lastRunAt?: string | null;
        proposalCountsLastRunAt?: string | null;
        webhookUrl?: string | null;
      };
      const next = {
        lastRunAt: data.lastRunAt ?? null,
        proposalCountsLastRunAt: data.proposalCountsLastRunAt ?? null,
      };
      setLastRunAt(next.lastRunAt);
      setProposalCountsLastRunAt(next.proposalCountsLastRunAt);
      setWebhookUrl(data.webhookUrl ?? null);
      return next;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    fetchLast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    if (state.kind === "loading") return;
    if (!webhookUrl) {
      setState({ kind: "err", msg: "웹훅 URL 미설정 (N8N_SYNC_WEBHOOK_URL)" });
      return;
    }
    const beforeProposalCounts = ms(proposalCountsLastRunAt);
    setState({ kind: "loading" });
    try {
      // 브라우저에서 n8n 웹훅 직접 트리거. no-cors 라 응답은 못 읽는다(트리거만).
      await fetch(webhookUrl, { method: "POST", mode: "no-cors" });
    } catch {
      setState({ kind: "err", msg: "요청 실패" });
      return;
    }
    // 지원수 리프레시가 끝나면 전용 last_run_at 이 오른다. 그때 서버 데이터를 다시 읽는다.
    for (let i = 0; i < POLL_MAX; i++) {
      await sleep(POLL_INTERVAL);
      const latest = await fetchLast();
      if (ms(latest?.proposalCountsLastRunAt ?? null) > beforeProposalCounts) {
        router.refresh();
        setState({ kind: "idle" });
        return;
      }
    }
    // 시각이 안 올랐다 = (워크플로 미연결/지연) 또는 (사외망이라 차단됨).
    // 둘을 구분할 수 없으니 거짓 실패 대신 안내만 한다.
    setState({
      kind: "note",
      msg: "동기화 요청됨 · 반영이 없으면 회사(사내) 네트워크에서 눌러주세요",
    });
  }

  const last = formatKst(lastRunAt);

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.btn}
        onClick={run}
        disabled={state.kind === "loading"}
      >
        <span className={state.kind === "loading" ? styles.spin : ""}>↻</span>
        {state.kind === "loading" ? "동기화 중…" : "지금 동기화"}
      </button>
      {state.kind === "err" ? (
        <span className={`${styles.msg} ${styles.err}`}>{state.msg}</span>
      ) : state.kind === "note" ? (
        <span className={styles.msg}>{state.msg}</span>
      ) : (
        last && (
          <span className={styles.msg}>
            <span className={styles.label}>마지막 동기화 </span>
            {last}
          </span>
        )
      )}
    </div>
  );
}
