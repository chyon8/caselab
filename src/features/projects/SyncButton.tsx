"use client";

import { useEffect, useState } from "react";
import styles from "./SyncButton.module.css";

type State = { kind: "idle" | "loading" | "err"; msg?: string };

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
const POLL_MAX = 20; // 3s × 20 = 최대 60초까지 완료 대기

/** 홈 상단 수동 동기화 버튼. n8n 웹훅 트리거 → 완료(last_run_at 전진)되면 마지막 동기화 시각 갱신. */
export default function SyncButton() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);

  // cache:"no-store" 필수 — 없으면 브라우저가 이 GET 을 캐싱해 last_run_at 이 영원히 옛 값으로
  // 보이고, 그러면 아래 폴링이 완료(시각 전진)를 못 잡아 스피너가 안 멈춘다.
  async function fetchLast(): Promise<string | null> {
    try {
      const res = await fetch("/api/admin/sync", { cache: "no-store" });
      const data = (await res.json()) as { lastRunAt?: string | null };
      const v = data.lastRunAt ?? null;
      setLastRunAt(v);
      return v;
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
    const before = ms(lastRunAt);
    setState({ kind: "loading" });
    try {
      const res = await fetch("/api/admin/sync", { method: "POST" });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setState({ kind: "err", msg: data.error ?? "실패" });
        return;
      }
      // 완료(last_run_at 전진)될 때까지 폴링. 전진을 잡으면 즉시,
      // 못 잡아도 60초 뒤엔 반드시 스피너를 멈춘다(무한 로딩 방지).
      for (let i = 0; i < POLL_MAX; i++) {
        await sleep(POLL_INTERVAL);
        const latest = await fetchLast();
        if (ms(latest) > before) break;
      }
      setState({ kind: "idle" });
    } catch {
      setState({ kind: "err", msg: "요청 실패" });
    }
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
