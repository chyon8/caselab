"use client";

import { useState } from "react";
import Link from "next/link";
import type { LowProposalPage } from "@/data/types";
import type { ReportPeriod } from "./period";
import styles from "./Report.module.css";

/**
 * 저지원 프로젝트 목록 + 페이지 넘김.
 *
 * URL(?lp=)이 아니라 클라이언트 상태로 넘긴다. 링크로 넘기면 RSC 내비게이션이 돌아
 * ①리포트 집계 12개가 통째로 다시 계산되고 ②스크롤이 페이지 맨 위로 튄다.
 * 이 목록은 공유할 만한 화면 상태가 아니라 훑어보는 것이므로, URL에 안 실어도 잃는 게 없다.
 */
export default function LowProposalList({
  initial,
  period,
}: {
  /** 서버가 그린 첫 페이지 — 첫 페인트에 목록이 이미 들어 있다 */
  initial: LowProposalPage;
  period: ReportPeriod;
}) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);

  const last = Math.max(1, Math.ceil(data.total / data.pageSize));

  const go = async (page: number): Promise<void> => {
    if (page < 1 || page > last || loading) return;
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page) });
      if (period !== "전체") q.set("period", period);
      const res = await fetch(`/api/low-proposals?${q}`);
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as LowProposalPage);
    } catch {
      // 실패하면 보던 페이지를 그대로 둔다 — 목록이 빈 채로 남는 것보다 낫다
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className={`${styles["table-wrap"]} ${loading ? styles.loading : ""}`}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>모집 전환</th>
              <th>프로젝트</th>
              <th>공급 제약</th>
              <th className={styles.num}>지원</th>
              <th className={styles.num}>예산</th>
              <th>결과</th>
              <th>담당</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((p) => (
              <tr key={p.id}>
                <td>{p.recruitedAt}</td>
                <td className={styles["cell-title"]}>
                  <Link href={`/projects/${p.id}`} className={styles["row-link"]}>
                    {p.title}
                  </Link>
                </td>
                <td>{p.supplyTags.length ? p.supplyTags.join(" · ") : "—"}</td>
                <td className={styles.num}>{p.proposalCount}건</td>
                <td className={styles.num}>{p.budget ?? "—"}</td>
                <td>{p.status}</td>
                <td>{p.manager || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {last > 1 && (
        <div className={styles.pager}>
          <button
            type="button"
            className={styles["pager-btn"]}
            onClick={() => go(data.page - 1)}
            disabled={data.page <= 1 || loading}
          >
            ← 이전
          </button>
          <span className={styles["pager-at"]}>
            {data.page} / {last}
          </span>
          <button
            type="button"
            className={styles["pager-btn"]}
            onClick={() => go(data.page + 1)}
            disabled={data.page >= last || loading}
          >
            다음 →
          </button>
        </div>
      )}
    </>
  );
}
