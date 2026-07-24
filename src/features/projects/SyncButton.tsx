"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./SyncButton.module.css";

type State = { kind: "idle" | "loading" | "done" | "err"; msg?: string };

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

/** 완료 판정 폴링 — last_run_at 이 클릭 시점보다 최신이 될 때까지 (최대 3분) */
const POLL_INTERVAL = 3000;
const POLL_MAX = 60; // 3s × 60 = 3분

/**
 * 홈 상단 수동 동기화 버튼. n8n 웹훅을 트리거만 하고(실제 싱크는 백그라운드), 이후
 * last_run_at 이 전진하는지 폴링해 실제로 완료 보고가 들어오면 "완료됨"으로 바꾼다.
 */
export default function SyncButton() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function fetchLast(): Promise<string | null> {
    try {
      const res = await fetch("/api/admin/sync");
      const data = (await res.json()) as { lastRunAt?: string | null };
      if (alive.current) setLastRunAt(data.lastRunAt ?? null);
      return data.lastRunAt ?? null;
    } catch {
      return null; // 표시용이라 실패해도 무시
    }
  }

  useEffect(() => {
    fetchLast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    const before = ms(lastRunAt);
    setState({ kind: "loading" });
    let res: Response;
    try {
      res = await fetch("/api/admin/sync", { method: "POST" });
    } catch {
      setState({ kind: "err", msg: "요청 실패" });
      return;
    }
    const data = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      setState({ kind: "err", msg: data.error ?? "실패" });
      return;
    }

    // 트리거 성공 — 이제 실제 완료 보고(last_run_at 전진)를 폴링한다.
    for (let i = 0; i < POLL_MAX; i++) {
      await sleep(POLL_INTERVAL);
      if (!alive.current) return;
      const latest = await fetchLast();
      if (ms(latest) > before) {
        setState({ kind: "done", msg: "완료됨" });
        return;
      }
    }
    // 3분 안에 완료 보고가 안 옴 — 백그라운드에서 계속 도는 중일 수 있다.
    if (alive.current) setState({ kind: "done", msg: "진행 중 · 잠시 후 반영" });
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
      ) : state.kind === "done" ? (
        <span className={`${styles.msg} ${styles.ok}`}>
          {state.msg}
          {last ? ` · ${last}` : ""}
        </span>
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
