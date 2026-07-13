/**
 * DB 원시값(원 단위 금액, 일수, timestamptz) → 화면 표기.
 * 표기 기준은 mock 데이터와 동일하게 맞춘다 ("4,500만원", "160일", "07-02").
 */

function toNumber(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 원 단위 → "4,500만원" (DATA_SCHEMA §1: budget은 원 단위, VAT 별도) */
export function formatWon(v: number | string | null | undefined): string | null {
  const n = toNumber(v);
  if (n === null) return null;
  return `${Math.round(n / 10000).toLocaleString("ko-KR")}만원`;
}

/** 일수 → "160일" */
export function formatDays(v: number | string | null | undefined): string | null {
  const n = toNumber(v);
  if (n === null) return null;
  return `${n}일`;
}

/**
 * 날짜는 항상 KST로 표기한다.
 * 서버 로컬 타임존을 쓰면 Vercel(UTC)에 배포했을 때 날짜가 하루씩 밀린다.
 */
const KST = "Asia/Seoul";

/** → "07-02" */
export function formatMonthDay(v: Date | string | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string): string => p.find((x) => x.type === t)?.value ?? "";
  return `${get("month")}-${get("day")}`;
}

/** → "06-12 14:20" */
export function formatMonthDayTime(v: Date | string | null | undefined): string {
  const d = toDate(v);
  if (!d) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: KST,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string): string => p.find((x) => x.type === t)?.value ?? "";
  return `${formatMonthDay(d)} ${get("hour")}:${get("minute")}`;
}

/** 오늘로부터 며칠 전인지 (목록의 기간 필터가 이 값을 쓴다) */
export function daysSince(v: Date | string | null | undefined): number {
  const d = toDate(v);
  if (!d) return 0;
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}
