import sk from "./Skeleton.module.css";

/** 리스트 뷰 스켈레톤 행 (테이블 헤더 아래 placeholder) */
export function ListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={sk["list-row"]}>
          <div className={`${sk.bone} ${sk["bone-star"]}`} />
          <div className={`${sk.bone} ${sk["bone-name"]}`} />
          <div className={`${sk.bone} ${sk["bone-short"]}`} />
          <div className={`${sk.bone} ${sk["bone-chip"]}`} />
          <div className={`${sk.bone} ${sk["bone-short"]}`} />
          <div className={`${sk.bone} ${sk["bone-short"]}`} />
          <div className={`${sk.bone} ${sk["bone-short"]}`} />
        </div>
      ))}
    </>
  );
}

/** 칸반 뷰 스켈레톤 컬럼 */
export function KanbanSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <>
      {Array.from({ length: cols }, (_, i) => (
        <div key={i} className={sk["kanban-col"]}>
          <div className={sk["kanban-head"]}>
            <div className={`${sk.bone} ${sk["bone-dot"]}`} />
            <div className={`${sk.bone} ${sk["bone-title"]}`} />
          </div>
          {Array.from({ length: 3 }, (_, j) => (
            <div key={j} className={sk["kanban-card"]}>
              <div className={`${sk.bone} ${sk["bone-card-name"]}`} />
              <div className={`${sk.bone} ${sk["bone-card-meta"]}`} />
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
