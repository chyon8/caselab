"use client";

import { useEffect, useRef, useState } from "react";
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

// n8n 은 Cloudflare Access 뒤에 있어 Vercel(서버) 요청은 403 으로 막힌다. 대신 "이미 Access 에
// 신뢰된 기기"인 사용자 브라우저에서 직접 트리거한다. no-cors 라 응답은 못 읽고 — 성공 여부는
// last_run_at 폴링으로 확인한다. 그래서 트리거가 실제로 통과했는지는 시각 전진으로만 판정한다.
const WEBHOOK_URL = process.env.NEXT_PUBLIC_N8N_SYNC_WEBHOOK_URL;

/** 홈 상단 수동 동기화 버튼. n8n 웹훅 트리거 → 완료(last_run_at 전진)되면 마지막 동기화 시각 갱신. */
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
      return null;
    }
  }

  useEffect(() => {
    fetchLast();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    if (state.kind === "loading") return;
    if (!WEBHOOK_URL) {
      setState({ kind: "err", msg: "웹훅 URL 미설정 (NEXT_PUBLIC_N8N_SYNC_WEBHOOK_URL)" });
      return;
    }
    const before = ms(lastRunAt);
    setState({ kind: "loading" });
    try {
      // no-cors: 응답을 못 읽는다(트리거만). 실제 통과 여부는 아래 폴링으로 판정.
      await fetch(WEBHOOK_URL, { method: "POST", mode: "no-cors" });
    } catch {
      setState({ kind: "err", msg: "요청 실패" });
      return;
    }
    // 완료(last_run_at 전진)될 때까지 "동기화 중…" 유지하며 폴링.
    let advanced = false;
    for (let i = 0; i < POLL_MAX; i++) {
      await sleep(POLL_INTERVAL);
      if (!alive.current) return;
      const latest = await fetchLast();
      if (ms(latest) > before) {
        advanced = true;
        break; // 완료 — 마지막 동기화 시각이 갱신됨
      }
    }
    if (!alive.current) return;
    // 시각이 안 움직였으면 트리거가 Access 에 막혔거나(신뢰 안 된 기기) 아직 안 끝난 것.
    setState(
      advanced
        ? { kind: "idle" } // 갱신된 "마지막 동기화 {시각}" 표시
        : { kind: "err", msg: "동기화 확인 안 됨 — 사내망/신뢰된 기기에서 눌러주세요" },
    );
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
