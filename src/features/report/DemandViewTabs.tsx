import Link from "next/link";
import styles from "./TargetDemandReport.module.css";

export type DemandView = "target" | "submission";

const VIEWS: { value: DemandView; label: string; href: string }[] = [
  { value: "target", label: "공고 기반 타깃 후보", href: "/report/target-demand" },
  { value: "submission", label: "제출→모집 전환 패턴", href: "/report/target-demand?view=submission" },
];

export function parseDemandView(value?: string): DemandView {
  return value === "submission" ? "submission" : "target";
}

/** 수요 리포트 안의 보고서 전환 탭 */
export default function DemandViewTabs({ view }: { view: DemandView }) {
  return (
    <nav className={styles.viewTabs} aria-label="보고서">
      {VIEWS.map((item) => (
        <Link key={item.value} href={item.href} className={`${styles.viewTab} ${item.value === view ? styles.viewActive : ""}`}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
