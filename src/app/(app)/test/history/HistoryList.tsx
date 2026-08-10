"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SessionListItem } from "@/lib/review-session";
import styles from "./history.module.css";

/** 저장 시각 — TIMESTAMPTZ(UTC)라 파싱해서 KST로 찍는다 */
function formatSavedAt(raw: string): string {
  return new Date(raw).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HistoryList({
  sessions,
  email,
}: {
  sessions: SessionListItem[];
  email: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(sessions);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // 되돌릴 수 없는 삭제라 확인 모달을 거친다. 대상 세션을 들고 있으면 모달이 뜬다.
  const [confirming, setConfirming] = useState<SessionListItem | null>(null);

  // 모달 Esc 닫기 — 삭제 중에는 닫지 않는다(요청이 날아가 있는 상태라 화면만 사라지면 혼란)
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setConfirming(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, pending]);

  /** 왔던 곳으로. 내역 페이지를 직접 연 경우(히스토리 없음)엔 검수 화면으로 보낸다. */
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push("/test");
  };

  const remove = () => {
    if (!confirming) return;
    const id = confirming.id;
    setPending(true);
    setError("");
    fetch(`/api/review-session/${id}`, { method: "DELETE" })
      .then(async (r) => {
        if (!r.ok) throw new Error("삭제 실패");
        setRows((prev) => prev.filter((s) => s.id !== id));
        setConfirming(null);
      })
      .catch(() => setError("삭제하지 못했습니다."))
      .finally(() => setPending(false));
  };

  return (
    <div className={styles.page}>
      <button type="button" className={styles.backBtn} onClick={goBack}>
        ← 뒤로
      </button>

      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>검수 내역</h1>
          <p className={styles.subtitle}>{email} 님이 진행한 검수만 표시됩니다</p>
        </div>
        <Link href="/test" className={styles.newBtn}>
          + 새 검수
        </Link>
      </div>

      {error && <p className={styles.err}>{error}</p>}

      {rows.length === 0 ? (
        <p className={styles.empty}>
          저장된 검수가 없습니다. <Link href="/test">새 검수</Link>를 시작하세요.
        </p>
      ) : (
        <ul className={styles.list}>
          {rows.map((s) => (
            <li key={s.id} className={styles.row}>
              <div className={styles.rowMain}>
                <Link href={`/test?session=${s.id}`} className={styles.rowTitle}>
                  {s.title || "(제목 없음)"}
                </Link>
                <p className={styles.preview}>{s.preview}</p>
                <div className={styles.meta}>
                  <span>{formatSavedAt(s.updated_at)}</span>
                  {s.call_count > 0 && <span>통화 {s.call_count}건</span>}
                  {s.has_draft && <span className={styles.draftBadge}>공고문 draft</span>}
                </div>
              </div>
              <div className={styles.rowActions}>
                <Link href={`/test?session=${s.id}`} className={styles.openBtn}>
                  이어하기
                </Link>
                <button type="button" className={styles.deleteBtn} onClick={() => setConfirming(s)}>
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 삭제 확인 — 되돌릴 수 없으므로 무엇을 지우는지 제목까지 보여준다 */}
      {confirming && (
        <div className={styles.modalScrim} onClick={() => !pending && setConfirming(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>이 검수를 삭제할까요?</div>
            <p className={styles.modalTarget}>{confirming.title || "(제목 없음)"}</p>
            <p className={styles.modalWarn}>
              분석 결과와 공고문 초안이 함께 지워집니다. 되돌릴 수 없습니다.
            </p>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setConfirming(null)}
                disabled={pending}
              >
                취소
              </button>
              <button
                type="button"
                className={styles.deleteConfirm}
                onClick={remove}
                disabled={pending}
              >
                {pending ? "삭제 중…" : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
