"use client";

// 검수 스코어링 테스트 화면 (/test) — 기존 기능과 격리된 프로토타입.
// 러프 인풋 하나 → 병렬로 독립 로드: ①견적 ②스코어링 ③유사사례 ④공고문 재배치 미리보기.
// 결과는 localStorage에 저장 → 새로고침해도 마지막 결과 복원.
// Mock 모드(기본 ON): API를 아예 안 치고 고정 mock 번들을 즉시 표시(UI 반복 작업용). 토글로 실제 호출.

import { useState, useEffect } from "react";
import Link from "next/link";
import { useApp } from "@/state/AppContext";
import type { SimilarProject, ReviewTips } from "@/data/types";
import type { ScoreResult } from "@/lib/scoring";
import type { AskQuestion } from "@/lib/questions";
import type { EstimateResult, EstimateOption } from "@/lib/estimate";
import type { RepostResult } from "@/lib/repost";
import { REPOST_MISSING } from "@/lib/repost";
import type { BriefResult } from "@/lib/brief";
import type { DraftResult } from "@/lib/draft";
import { formatManwon } from "@/lib/estimate-calc";
import type { CallRecord } from "@/lib/calls";
import type { SessionListItem, SessionRow } from "@/lib/review-session";
import { scrubPii } from "@/lib/sync/pii";
import { MOCK_BUNDLE, MOCK_CALLS } from "./mock";
import styles from "./test.module.css";

const STORAGE_KEY = "caselab-test-last";

const SAMPLE =
  "반려동물 산책 매칭 앱을 만들고 싶어요. 견주가 산책 도우미를 지역·시간으로 찾아 예약하고, 산책 끝나면 사진이랑 경로를 받아봐요. 결제도 앱에서 하고요. 예산은 잘 모르겠고 최대한 빨리요.";

/** purpose → 태그 클래스 (한글 클래스명은 피한다) */
const PURPOSE_CLASS: Record<AskQuestion["purpose"], string> = {
  범위: styles.qScope,
  견적: styles.qQuote,
  둘다: styles.qBoth,
};

/** 통화 길이(초) → "10분 12초" */
function formatDuration(secs: number | null): string {
  if (secs === null) return "";
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

/**
 * "2026-04-07 13:55:33" → "04-07 13:55".
 * Date로 파싱하지 않는다 — 타임존 표기가 없는 KST 문자열이라 파싱하면 브라우저 로컬 타임존으로
 * 해석돼 표시가 밀릴 수 있다. 온 그대로 자른다.
 */
function formatCallTime(raw: string | null): string {
  if (!raw) return "";
  return raw.length >= 16 ? raw.slice(5, 16) : raw;
}

/**
 * 세션 저장 시각 — 통화 시각과 반대로 **파싱해야** 한다. 이건 진짜 TIMESTAMPTZ라 UTC("…Z")로
 * 오고, 그대로 자르면 9시간 밀린 시각이 찍힌다.
 */
function formatSavedAt(raw: string): string {
  return new Date(raw).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * n8n 프록시 웹훅으로 통화 조회. 명세: n8n/calls_proxy_pipeline.md, DATA_SCHEMA §8-3.
 *
 * GET + 쿼리스트링으로 보낸다 — CORS "단순 요청"이라 프리플라이트(OPTIONS)가 없다.
 * POST + application/json 이면 브라우저가 OPTIONS 를 먼저 보내는데, n8n Webhook 노드가 그걸
 * 안 받으면 조회 자체가 실패한다. 세팅에서 가장 흔히 깨지는 지점이라 아예 피한다.
 */
async function fetchCalls(memberName: string, phone: string): Promise<CallRecord[]> {
  const cfgRes = await fetch("/api/admin/calls-webhook", { cache: "no-store" });
  const cfg = (await cfgRes.json()) as { webhookUrl?: string | null };
  if (!cfg.webhookUrl) throw new Error("웹훅 URL 미설정 (N8N_CALLS_WEBHOOK_URL)");

  const url = new URL(cfg.webhookUrl);
  if (memberName) url.searchParams.set("member_name", memberName);
  if (phone) url.searchParams.set("phone", phone);
  url.searchParams.set("limit", "50"); // API 기본 50 / 최대 200

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    // 브라우저는 CORS 차단·사외망·n8n 다운을 구분해주지 않는다(전부 같은 TypeError).
    throw new Error(
      "통화 조회 실패 — 회사(사내) 네트워크인지, n8n 웹훅 응답에 CORS 헤더가 있는지 확인하세요",
    );
  }
  if (!res.ok) throw new Error(`통화 조회 실패 (${res.status})`);

  const data = (await res.json()) as { results?: CallRecord[] };
  return (data.results ?? [])
    // 요약·녹취가 둘 다 없는 껍데기 행 제외 (기존 데이터의 35.7%가 이랬음)
    .filter((c) => c.summary || c.transcript)
    // 최신순 — API 정렬 방향에 기대지 않는다
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    // 화면에 뿌리기 전 연락처 제거 (원문 속 전화·이메일)
    .map((c) => ({
      ...c,
      summary: scrubPii(c.summary),
      transcript: scrubPii(c.transcript),
    }));
}

/**
 * 저장된 브리핑 복원용 검사.
 * localStorage 번들에는 버전이 없어서, 필드를 바꾸면 옛 형태가 그대로 복원돼 렌더에서 터진다
 * (실제로 terms → concepts 로 바꿨을 때 발생). 형태가 안 맞으면 복원하지 않고 버린다 —
 * 어차피 다시 분석하면 채워지므로, 모양을 억지로 맞춰 반쪽짜리를 보여주는 것보다 낫다.
 */
function reviveBrief(b: unknown): BriefResult | null {
  if (!b || typeof b !== "object") return null;
  const v = b as Partial<BriefResult>;
  if (!Array.isArray(v.points) || !Array.isArray(v.concepts) || !Array.isArray(v.terms)) {
    return null;
  }
  return {
    oneLiner: typeof v.oneLiner === "string" ? v.oneLiner : "",
    points: v.points,
    terms: v.terms,
    concepts: v.concepts,
  };
}

/** 저장된 draft 복원용 검사 — reviveBrief와 같은 이유(번들에 버전이 없다) */
function reviveDraft(d: unknown): DraftResult | null {
  if (!d || typeof d !== "object") return null;
  const v = d as Partial<DraftResult>;
  return Array.isArray(v.sections) ? { sections: v.sections } : null;
}

/** confidence → 막대 색 */
function barColor(c: number): string {
  if (c >= 80) return "var(--status-success-fg)";
  if (c >= 50) return "var(--status-progress-fg)";
  return "var(--status-cancel-fg)";
}

/** 검수팁 한 그룹 (리스크/확인할것/기술쟁점) */
function TipGroup({ title, items }: { title: string; items: { text: string; freq?: number }[] }) {
  return (
    <div className={styles.tipGroup}>
      <div className={styles.tipGroupTitle}>{title}</div>
      <ul className={styles.tipList}>
        {items.map((t, i) => (
          <li key={i}>
            {t.text}
            {t.freq ? <span className={styles.tipFreq}> {t.freq}건</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 견적 옵션 카드 — 방식·포함/제외 기능·기간·파트별 금액·총금액을 한눈에 */
function OptionCard({ option }: { option: EstimateOption }) {
  const { cost } = option;
  return (
    <div className={styles.optionCard}>
      <div className={styles.optionHead}>
        <span className={styles.optionName}>{option.name}</span>
        <span className={styles.optionPeriod}>{option.period}</span>
      </div>
      {option.approach && <div className={styles.optionApproach}>{option.approach}</div>}

      {option.includedFeatures.length > 0 && (
        <ul className={styles.featIncluded}>
          {option.includedFeatures.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
      {option.excludedFeatures.length > 0 && (
        <ul className={styles.featExcluded}>
          {option.excludedFeatures.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}

      <div className={styles.costTable}>
        <div className={styles.costRow}>
          <span>기획</span>
          <span>{formatManwon(cost.plan.cost)}</span>
        </div>
        <div className={styles.costRow}>
          <span>디자인</span>
          <span>{formatManwon(cost.design.cost)}</span>
        </div>
        <div className={styles.costRow}>
          <span>개발</span>
          <span>{formatManwon(cost.dev.cost)}</span>
        </div>
        <div className={styles.costRow}>
          <span>QA</span>
          <span>{formatManwon(cost.qa.cost)}</span>
        </div>
        <div className={styles.costRow}>
          <span>PM</span>
          <span>{formatManwon(cost.pm.cost)}</span>
        </div>
        {(cost.rnd.low > 0 || cost.rnd.high > 0) && (
          <div className={styles.costRow}>
            <span>R&D</span>
            <span>
              {cost.rnd.low === cost.rnd.high
                ? formatManwon(cost.rnd.low)
                : `${formatManwon(cost.rnd.low)} ~ ${formatManwon(cost.rnd.high)}`}
            </span>
          </div>
        )}
      </div>
      <div className={styles.costTotal}>
        <span>총 견적 (버퍼 10% 포함)</span>
        <span className={styles.costTotalAmount}>
          {cost.total.low === cost.total.high
            ? formatManwon(cost.total.low)
            : `${formatManwon(cost.total.low)} ~ ${formatManwon(cost.total.high)}`}
        </span>
      </div>
    </div>
  );
}

export default function TestPage() {
  const { user } = useApp();
  const [text, setText] = useState("");

  // 공고문 draft — 의뢰 원문 + 고른 통화 녹취. 버튼으로만 생성(통화를 골라야 의미가 있다).
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState("");

  // 브리핑 — 원문을 다 안 읽어도 파악되게. 근거 없는 항목은 brief.ts가 이미 버리고 온다.
  const [brief, setBrief] = useState<BriefResult | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [briefError, setBriefError] = useState("");

  const [questions, setQuestions] = useState<AskQuestion[] | null>(null);
  const [qLoading, setQLoading] = useState(false);
  const [qError, setQError] = useState("");

  const [score, setScore] = useState<ScoreResult | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  const [scoreError, setScoreError] = useState("");

  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [estLoading, setEstLoading] = useState(false);
  const [estError, setEstError] = useState("");

  const [sims, setSims] = useState<SimilarProject[] | null>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState("");

  // 검수팁 — 자동 생성하지 않는다(매 분석마다 LLM 호출이 낭비). 버튼을 눌러야 생성.
  // normalized(유사사례 검색이 만든 정규화 공고문)를 들고 있다가 그때 넘긴다.
  const [tips, setTips] = useState<ReviewTips | null>(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState("");
  const [normalized, setNormalized] = useState<string | null>(null);

  // 공고문 재배치 미리보기 — 원문 워딩 그대로, 위치만 공고 양식으로
  const [repost, setRepost] = useState<RepostResult | null>(null);
  const [repostLoading, setRepostLoading] = useState(false);
  const [repostError, setRepostError] = useState("");

  // 통화 녹취 불러오기 — 조회 결과는 저장하지 않는다(선택한 것만 아래에 보관).
  // 기본 member_name은 로그인 세션 이름(구글 표시 이름) — 통화 API 스펙과 실제로 맞는지는 미확인(calls_proxy_pipeline.md 참조).
  const [memberName, setMemberName] = useState(user?.name ?? "");
  const [phone, setPhone] = useState("");
  // 이름·번호는 API에서 AND로 걸린다 → 둘을 동시에 노출하면 "번호로만 찾기"를 하려고 이름을 매번
  // 지워야 한다. 애초에 택일이므로 모드로 가른다(안 쓰는 쪽은 아예 안 보내고 안 보인다).
  const [lookupBy, setLookupBy] = useState<"name" | "phone">("name");
  const [calls, setCalls] = useState<CallRecord[] | null>(null);
  const [callsLoading, setCallsLoading] = useState(false);
  const [callsError, setCallsError] = useState("");
  // 선택된 통화만 보관(원문에는 아직 합치지 않음 — 공고문 draft 생성은 다음 단계)
  const [selectedCalls, setSelectedCalls] = useState<CallRecord[]>([]);
  // 원문 상세보기 — 요약 2줄만으로는 어느 통화인지 못 가르는 경우가 있어 전문을 그대로 띄운다
  const [viewCall, setViewCall] = useState<CallRecord | null>(null);

  // 검수 세션 — localStorage는 "지금 보던 화면"을 즉시 복원하는 용도로 그대로 두고,
  // 영속 보관과 여러 건 오가기는 DB(review_session)가 맡는다. 한 건 = 한 행, 덮어쓰기.
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Mock 모드 — 기본 ON(API 안 침). 토글 상태도 저장해 새로고침 후 유지.
  const [mockMode, setMockMode] = useState(true);

  const busy =
    qLoading || scoreLoading || estLoading || simLoading || repostLoading || briefLoading;

  // 마운트 시 마지막 결과 복원 (새로고침해도 안 사라지게).
  // 내역 페이지에서 "이어하기"로 온 경우(?session=N)는 그 세션이 우선 — localStorage 복원은 건너뛴다.
  // useSearchParams 대신 location을 직접 읽는다(Suspense 경계를 요구하지 않아 단순하다).
  useEffect(() => {
    const wanted = Number(new URLSearchParams(window.location.search).get("session"));
    if (Number.isFinite(wanted) && wanted > 0) {
      openSession(wanted);
      window.history.replaceState(null, "", "/test"); // 새로고침 때마다 다시 불러오지 않게 정리
      return;
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const b = JSON.parse(raw) as {
        text?: string;
        brief?: unknown;
        draft?: unknown;
        questions?: AskQuestion[];
        score?: ScoreResult;
        estimate?: EstimateResult;
        sims?: SimilarProject[];
        tips?: ReviewTips;
        normalized?: string | null;
        repost?: RepostResult;
        mockMode?: boolean;
        sessionId?: number;
      };
      if (typeof b.text === "string") setText(b.text);
      setBrief(reviveBrief(b.brief));
      setDraft(reviveDraft(b.draft));
      if (b.questions) setQuestions(b.questions);
      if (b.score) setScore(b.score);
      if (b.estimate) setEstimate(b.estimate);
      if (b.sims) setSims(b.sims);
      if (b.tips) setTips(b.tips);
      if (b.normalized) setNormalized(b.normalized); // 새로고침 후에도 검수팁 버튼이 동작하도록
      if (b.repost) setRepost(b.repost);
      if (typeof b.mockMode === "boolean") setMockMode(b.mockMode);
      if (typeof b.sessionId === "number") setSessionId(b.sessionId);
    } catch {
      // 손상된 저장값 무시
    }
  }, []);

  // 원문 모달 Esc 닫기
  useEffect(() => {
    if (!viewCall) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setViewCall(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewCall]);

  // 결과가 정착되면(로딩 중 아님) 스냅샷 저장 — 매번 API 안 쳐도 되게
  useEffect(() => {
    if (busy) return;
    if (!brief && !questions && !score && !estimate && !sims && !repost && !draft) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          text,
          brief,
          draft,
          questions,
          score,
          estimate,
          sims,
          tips,
          normalized,
          repost,
          mockMode,
          sessionId,
        }),
      );
    } catch {
      // 저장 실패(용량 등)는 조용히 무시 — 화면 동작엔 영향 없음
    }
    // selectedCalls는 저장하지 않는다 — 통화 목록 자체를 저장하지 않으므로, 선택만 남기면
    // 새로고침 후 목록 없이 "N건 선택됨"만 뜨는 유령 상태가 된다. 선택은 조회 결과에 딸린 것.
  }, [busy, text, brief, draft, questions, score, estimate, sims, tips, normalized, repost, mockMode, sessionId]);

  // DB 저장 — 타이핑 중에 매번 치지 않도록 1.5초 뒤에 한 번. Mock 모드는 저장하지 않는다
  // (가짜 번들이 목록을 채우면 안 된다). 여긴 selectedCalls도 저장한다 — localStorage와 달리
  // 목록을 다시 불러올 수 있어 유령 상태가 안 생기고, 어느 통화를 근거로 썼는지가 기록으로 남는다.
  useEffect(() => {
    if (busy || mockMode) return;
    if (!brief && !questions && !score && !estimate && !sims && !repost && !draft) return;
    const timer = setTimeout(() => {
      setSaveState("saving");
      fetch("/api/review-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: sessionId,
          // 브리핑이 아직 없으면 원문 앞부분으로 대신한다. 첨부파일 텍스트가 통째로 들어오는
          // 경우가 있어 줄바꿈·연속 공백을 눌러야 목록에서 한 줄로 읽힌다.
          title: brief?.oneLiner || text.trim().replace(/\s+/g, " ").slice(0, 60),
          sourceText: text,
          analysis: { brief, questions, score, estimate, sims, tips, normalized, repost },
          draft,
          calls: selectedCalls.map((c) => ({
            id: c.id,
            summary: c.summary,
            created_at: c.created_at,
            project_title: c.project_title,
          })),
        }),
      })
        .then(async (r) => {
          const d = (await r.json()) as { id?: number; error?: string };
          if (!r.ok || !d.id) throw new Error(d.error ?? "저장 실패");
          setSessionId(d.id);
          setSaveState("saved");
        })
        .catch(() => setSaveState("error"));
    }, 1500);
    return () => clearTimeout(timer);
  }, [busy, mockMode, text, brief, draft, questions, score, estimate, sims, tips, normalized, repost, selectedCalls, sessionId]);

  // 목록 새로고침 — 마운트 시, 그리고 새 행이 생겼을 때(sessionId 변경)
  useEffect(() => {
    fetch("/api/review-session", { cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json()) as { sessions?: SessionListItem[] };
        setSessions(d.sessions ?? []);
      })
      .catch(() => setSessions([]));
  }, [sessionId]);

  /** 버튼으로만 호출된다. Mock 모드에선 API 대신 mock 팁. */
  const loadTips = () => {
    if (mockMode) {
      setTips(MOCK_BUNDLE.tips);
      return;
    }
    if (!normalized) return;
    setTipsLoading(true);
    setTipsError("");
    fetch("/api/review-tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ normalized, scope: "전체" }),
    })
      .then(async (r) => {
        const d = (await r.json()) as { reviewTips?: ReviewTips; error?: string };
        if (!r.ok) throw new Error(d.error ?? "검수팁 생성 실패");
        setTips(d.reviewTips ?? null);
      })
      .catch((e: unknown) => setTipsError(e instanceof Error ? e.message : "검수팁 생성 실패"))
      .finally(() => setTipsLoading(false));
  };

  /** "공고문 draft 생성" 버튼. 의뢰 원문 + 고른 통화 녹취를 합쳐 초안을 만든다. */
  const loadDraft = () => {
    setDraftError("");
    if (mockMode) {
      setDraft(MOCK_BUNDLE.draft);
      return;
    }
    const body = text.trim();
    if (body.length < 3) {
      setDraftError("의뢰 원문을 먼저 입력하세요");
      return;
    }
    setDraftLoading(true);
    fetch("/api/test-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: body,
        // 통화 전체가 아니라 draft에 필요한 세 필드만 보낸다
        calls: selectedCalls.map((c) => ({
          summary: c.summary,
          transcript: c.transcript,
          created_at: c.created_at,
        })),
      }),
    })
      .then(async (r) => {
        const d = (await r.json()) as DraftResult & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "공고문 draft 생성 실패");
        setDraft(d.sections ? d : null);
      })
      .catch((e: unknown) =>
        setDraftError(e instanceof Error ? e.message : "공고문 draft 생성 실패"),
      )
      .finally(() => setDraftLoading(false));
  };

  /** "내 통화 불러오기" 버튼. Mock 모드에선 API 대신 mock 통화 목록. */
  const loadCalls = () => {
    setCallsError("");
    setCalls(null);
    setSelectedCalls([]); // 새 조회 = 새 목록. 이전 목록에서 고른 건 남겨두면 안 된다
    if (mockMode) {
      setCalls(MOCK_CALLS);
      return;
    }
    // 고른 모드의 값만 보낸다 — 반대쪽 값이 섞이면 API가 AND로 걸어 조용히 0건이 된다
    const name = lookupBy === "name" ? memberName.trim() : "";
    const digits = lookupBy === "phone" ? phone.replace(/\D/g, "") : ""; // 하이픈 등 제거
    // API 제약(DATA_SCHEMA §8-3)을 미리 걸러 400 대신 알아들을 수 있는 메시지를 낸다
    if (lookupBy === "name" && !name) {
      setCallsError("매니저 이름을 입력하세요");
      return;
    }
    if (lookupBy === "phone" && digits.length < 8) {
      setCallsError("전화번호는 8자리 이상 입력하세요 (부분 입력 가능)");
      return;
    }
    setCallsLoading(true);
    fetchCalls(name, digits)
      .then((rows) => setCalls(rows))
      .catch((e: unknown) => setCallsError(e instanceof Error ? e.message : "통화 조회 실패"))
      .finally(() => setCallsLoading(false));
  };

  const toggleCallSelect = (call: CallRecord) => {
    setSelectedCalls((prev) =>
      prev.some((c) => c.id === call.id) ? prev.filter((c) => c.id !== call.id) : [...prev, call],
    );
  };

  /** 화면을 비운다. 새 검수 시작과 세션 불러오기가 공유한다. */
  const clearAll = () => {
    setText("");
    setBrief(null);
    setDraft(null);
    setQuestions(null);
    setScore(null);
    setEstimate(null);
    setSims(null);
    setTips(null);
    setNormalized(null);
    setRepost(null);
    setCalls(null);
    setSelectedCalls([]);
    setSaveState("idle");
  };

  /** 새 검수 — 지금 세션을 닫고 빈 화면으로. 다음 저장은 새 행이 된다. */
  const newReview = () => {
    clearAll();
    setSessionId(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 지우기 실패는 무시 — 아래 상태 초기화만으로 화면은 비워진다
    }
  };

  /** 저장된 검수 이어하기 — 통화 목록은 복원하지 않는다(원문을 저장 안 하므로 재조회해야 한다). */
  const openSession = (id: number) => {
    fetch(`/api/review-session/${id}`, { cache: "no-store" })
      .then(async (r) => {
        const d = (await r.json()) as { session?: SessionRow; error?: string };
        if (!r.ok || !d.session) throw new Error(d.error ?? "불러오기 실패");
        const a = (d.session.analysis ?? {}) as {
          brief?: unknown;
          questions?: AskQuestion[];
          score?: ScoreResult;
          estimate?: EstimateResult;
          sims?: SimilarProject[];
          tips?: ReviewTips;
          normalized?: string | null;
          repost?: RepostResult;
        };
        clearAll();
        setText(d.session.source_text);
        setBrief(reviveBrief(a.brief));
        setDraft(reviveDraft(d.session.draft));
        setQuestions(a.questions ?? null);
        setScore(a.score ?? null);
        setEstimate(a.estimate ?? null);
        setSims(a.sims ?? null);
        setTips(a.tips ?? null);
        setNormalized(a.normalized ?? null);
        setRepost(a.repost ?? null);
        setSessionId(d.session.id);
      })
      .catch(() => setSaveState("error"));
  };

  const run = () => {
    const body = text.trim();
    if (body.length < 3) return;

    // Mock 모드 — API 안 침. 고정 mock 번들을 즉시 표시(입력과 무관하게 같은 결과).
    if (mockMode) {
      setBriefError("");
      setBrief(MOCK_BUNDLE.brief);
      setQError("");
      setScoreError("");
      setEstError("");
      setSimError("");
      setRepostError("");
      setTipsError("");
      setText(MOCK_BUNDLE.text);
      setQuestions(MOCK_BUNDLE.questions);
      setScore(MOCK_BUNDLE.score);
      setEstimate(MOCK_BUNDLE.estimate);
      setSims(MOCK_BUNDLE.sims);
      setTips(null); // 검수팁은 실제 흐름과 똑같이 버튼을 눌러야 나온다
      setRepost(MOCK_BUNDLE.repost);
      return;
    }

    // 여섯 다 같은 인풋에서 독립적으로 — 하나가 느려도 나머지는 먼저 뜬다
    setBriefLoading(true);
    setBriefError("");
    setBrief(null);
    fetch("/api/test-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    })
      .then(async (r) => {
        const d = (await r.json()) as BriefResult & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "브리핑 생성 실패");
        setBrief(d);
      })
      .catch((e: unknown) => setBriefError(e instanceof Error ? e.message : "브리핑 생성 실패"))
      .finally(() => setBriefLoading(false));

    setQLoading(true);
    setQError("");
    setQuestions(null);
    fetch("/api/test-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    })
      .then(async (r) => {
        const d = (await r.json()) as { questions?: AskQuestion[]; error?: string };
        if (!r.ok) throw new Error(d.error ?? "질문 생성 실패");
        setQuestions(d.questions ?? []);
      })
      .catch((e: unknown) => setQError(e instanceof Error ? e.message : "질문 생성 실패"))
      .finally(() => setQLoading(false));

    setScoreLoading(true);
    setScoreError("");
    setScore(null);
    fetch("/api/test-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    })
      .then(async (r) => {
        const d = (await r.json()) as ScoreResult & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "스코어링 실패");
        setScore(d);
      })
      .catch((e: unknown) => setScoreError(e instanceof Error ? e.message : "스코어링 실패"))
      .finally(() => setScoreLoading(false));

    setEstLoading(true);
    setEstError("");
    setEstimate(null);
    fetch("/api/test-estimate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    })
      .then(async (r) => {
        const d = (await r.json()) as EstimateResult & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "견적 실패");
        setEstimate(d);
      })
      .catch((e: unknown) => setEstError(e instanceof Error ? e.message : "견적 실패"))
      .finally(() => setEstLoading(false));

    setSimLoading(true);
    setSimError("");
    setSims(null);
    setTips(null);
    setTipsError("");
    setNormalized(null);
    fetch("/api/similar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body, scope: "전체" }),
    })
      .then(async (r) => {
        const d = (await r.json()) as { results?: SimilarProject[]; normalized?: string; error?: string };
        if (!r.ok) throw new Error(d.error ?? "유사사례 검색 실패");
        setSims(d.results ?? []);
        // 검수팁은 여기서 자동 생성하지 않는다 — 재료(normalized)만 챙겨두고 버튼을 기다린다
        setNormalized(d.normalized ?? null);
      })
      .catch((e: unknown) => setSimError(e instanceof Error ? e.message : "유사사례 검색 실패"))
      .finally(() => setSimLoading(false));

    setRepostLoading(true);
    setRepostError("");
    setRepost(null);
    fetch("/api/test-repost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: body }),
    })
      .then(async (r) => {
        const d = (await r.json()) as RepostResult & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "공고문 재배치 실패");
        setRepost(d.sections ? d : null);
      })
      .catch((e: unknown) => setRepostError(e instanceof Error ? e.message : "공고문 재배치 실패"))
      .finally(() => setRepostLoading(false));
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>검수 스코어링 테스트</h1>
      <p className={styles.subtitle}>
        러프한 고객 의뢰를 넣으면 견적·스코어링·유사사례·공고문 재배치를 한 번에. (마지막 결과 자동 저장)
      </p>

      {/* 검수 세션 — 여러 건을 번갈아 진행해도 서로 안 덮어쓰게. Mock 모드 결과는 저장되지 않는다. */}
      <div className={styles.sessionBar}>
        <button type="button" className={styles.newReviewBtn} onClick={newReview}>
          + 새 검수
        </button>
        {sessions.length > 0 && (
          <select
            className={styles.sessionSelect}
            value={sessionId ?? ""}
            onChange={(e) => e.target.value && openSession(Number(e.target.value))}
          >
            <option value="">저장된 검수 불러오기…</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || "(제목 없음)"} · {formatSavedAt(s.updated_at)}
              </option>
            ))}
          </select>
        )}
        <Link href="/test/history" className={styles.historyLink}>
          검수 내역
        </Link>
        <span className={styles.saveState}>
          {saveState === "saving" && "저장 중…"}
          {saveState === "saved" && "저장됨"}
          {saveState === "error" && "저장 실패"}
          {mockMode && saveState === "idle" && "Mock 모드 — 저장 안 함"}
        </span>
      </div>

      <div className={styles.inputWrap}>
        <textarea
          className={styles.textarea}
          placeholder="고객이 보낸 정리 안 된 의뢰 내용을 붙여넣으세요…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className={styles.runRow}>
          <button className={styles.runBtn} onClick={run} disabled={busy || text.trim().length < 3}>
            {busy ? "분석 중…" : "분석"}
          </button>
          <button className={styles.runBtn} onClick={() => setText(SAMPLE)} disabled={busy} style={{ background: "var(--color-ink-muted-60)" }}>
            예시 넣기
          </button>
          <label className={styles.mockToggle}>
            <input type="checkbox" checked={mockMode} onChange={(e) => setMockMode(e.target.checked)} disabled={busy} />
            Mock 모드 (API 호출 안 함)
          </label>
        </div>
        {mockMode && (
          <p className={styles.mockHint}>
            Mock 모드가 켜져 있어 입력과 무관하게 저장된 예시 결과를 보여줍니다. 실제로 호출하려면 체크를 해제하세요.
          </p>
        )}
      </div>

      {/* 브리핑 — 원문을 다 안 읽어도 파악되게. 질문 패널 바로 위에 둬서 "파악 → 물어볼 것" 순으로 읽힌다. */}
      <section className={`${styles.panel} ${styles.briefPanel}`}>
        <div className={styles.panelHead}>
          <span className={styles.panelTitle}>프로젝트 브리핑</span>
          <span className={styles.panelHint}>원문 안 읽어도 파악되게 · 상담 전 훑기용</span>
        </div>
        {briefLoading && <p className={styles.muted}>요약 중…</p>}
        {briefError && <p className={styles.err}>{briefError}</p>}
        {!briefLoading && !briefError && !brief && <p className={styles.muted}>분석을 실행하세요.</p>}
        {brief && (
          <>
            {brief.oneLiner && <p className={styles.briefOneLiner}>{brief.oneLiner}</p>}
            {brief.points.length > 0 && (
              <ul className={styles.briefPoints}>
                {brief.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            )}
            {brief.terms.length > 0 && (
              <div className={styles.briefBlock}>
                <div className={styles.briefBlockTitle}>
                  용어·개념
                  <span className={styles.briefBlockNote}>고객이 쓴 말 중 알아둬야 할 것</span>
                </div>
                {brief.terms.map((c, i) => (
                  <p key={i} className={styles.briefTerm}>
                    <span className={styles.briefTermName}>{c.term}</span>
                    {c.plain}
                  </p>
                ))}
              </div>
            )}
            {brief.concepts.length > 0 && (
              <div className={styles.briefBlock}>
                <div className={styles.briefBlockTitle}>
                  기술적으로 알아야 할 것
                  <span className={styles.briefBlockNote}>기능 설명이 아니라 구현에 필요한 요소</span>
                </div>
                {brief.concepts.map((c, i) => (
                  <p key={i} className={styles.briefTerm}>
                    <span className={styles.briefTermName}>{c.term}</span>
                    {c.plain}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* 고객에게 물어볼 질문 — 범위·견적을 위한 핵심 산출물. 스코어링과 독립. */}
      <section className={`${styles.panel} ${styles.questionsPanel}`}>
        <div className={styles.panelHead}>
          <span className={styles.panelTitle}>고객에게 물어볼 질문</span>
          <span className={styles.panelHint}>업무범위 구체화 · 견적</span>
        </div>
        {qLoading && <p className={styles.muted}>질문 뽑는 중…</p>}
        {qError && <p className={styles.err}>{qError}</p>}
        {!qLoading && !qError && !questions && <p className={styles.muted}>분석을 실행하세요.</p>}
        {questions && questions.length === 0 && <p className={styles.muted}>확인할 질문이 없어요.</p>}
        {questions && questions.length > 0 && (
          <ul className={styles.questionList}>
            {questions.map((q, i) => (
              <li key={i}>
                <span className={`${styles.qTag} ${PURPOSE_CLASS[q.purpose]}`}>{q.purpose}</span> {q.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 공고문 미리보기 — 원문 워딩 그대로, 위치만 공고 양식으로 재배치 */}
      <section className={`${styles.panel} ${styles.repostPanel}`}>
        <div className={styles.panelHead}>
          <span className={styles.panelTitle}>공고문 미리보기</span>
          <span className={styles.panelHint}>원문 워딩 그대로 · 위치만 재배치</span>
        </div>
        {repostLoading && <p className={styles.muted}>재배치 중…</p>}
        {repostError && <p className={styles.err}>{repostError}</p>}
        {!repostLoading && !repostError && !repost && <p className={styles.muted}>분석을 실행하세요.</p>}
        {repost && (
          <div className={styles.repostDoc}>
            {repost.sections.map((s) => {
              const missing = s.body.trim() === REPOST_MISSING;
              return (
                <div key={s.heading} className={styles.repostSection}>
                  <div className={styles.repostHeading}>[{s.heading}]</div>
                  <p className={`${styles.repostBody} ${missing ? styles.repostMissing : ""}`}>{s.body}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className={styles.grid}>
        {/* 스코어링 */}
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>검수 스코어링</span>
            <span className={styles.panelHint}>공고 완성도 · 물어볼 것</span>
          </div>
          {scoreLoading && <p className={styles.muted}>평가 중…</p>}
          {scoreError && <p className={styles.err}>{scoreError}</p>}
          {!scoreLoading && !scoreError && !score && <p className={styles.muted}>분석을 실행하세요.</p>}
          {score && (
            <>
              <div className={styles.gateRow}>
                <span className={styles.total}>{score.total}</span>
                <span className={styles.totalUnit}>/ 100</span>
                <span
                  className={`${styles.gateBadge} ${score.gate.pass ? styles.gatePass : styles.gateBlock}`}
                >
                  {score.gate.pass ? "공고 작성 가능" : "정보 부족"}
                </span>
              </div>
              {!score.gate.pass && (
                <p className={styles.blocking}>필수 미달: {score.gate.blocking.join(", ")}</p>
              )}
              {score.sections.some((s) => !s.applicable) && (
                <p className={styles.naHint}>
                  해당없음 {score.sections.filter((s) => !s.applicable).length}개는 총점·게이트에서 제외됨
                </p>
              )}

              {score.sections.map((s) => (
                <div key={s.id} className={`${styles.section} ${s.applicable ? "" : styles.sectionNa}`}>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionLabel}>{s.label}</span>
                    {s.required && s.applicable && <span className={styles.reqDot}>필수</span>}
                    {s.applicable ? (
                      <span className={styles.confBadge} style={{ color: barColor(s.confidence) }}>
                        {s.confidence}
                      </span>
                    ) : (
                      <span className={styles.naBadge}>해당없음</span>
                    )}
                  </div>
                  {s.applicable && (
                    <div className={styles.bar}>
                      <div
                        className={styles.barFill}
                        style={{ width: `${s.confidence}%`, background: barColor(s.confidence) }}
                      />
                    </div>
                  )}
                  {s.summary && <p className={styles.sectionSummary}>{s.summary}</p>}
                </div>
              ))}
              {score.notes.length > 0 && (
                <div className={styles.notes}>
                  <div className={styles.notesTitle}>기타 특이사항</div>
                  <ul>
                    {score.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>

        {/* 유사사례 */}
        <section className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>유사사례</span>
            <span className={styles.panelHint}>과거 유사 프로젝트</span>
          </div>
          {simLoading && <p className={styles.muted}>검색 중…</p>}
          {simError && <p className={styles.err}>{simError}</p>}
          {!simLoading && !simError && !sims && <p className={styles.muted}>분석을 실행하세요.</p>}
          {sims && sims.length === 0 && <p className={styles.muted}>유사사례가 없습니다.</p>}
          {sims?.map((p) => (
            <a key={p.id} href={`/projects/${p.id}`} target="_blank" rel="noreferrer" className={styles.simItem}>
              <span className={styles.simName}>{p.name}</span>
              <span className={styles.simMeta}>
                {p.budget ? `예산 ${p.budget}` : "예산 미정"}
                {p.contractAmount && <span className={styles.simStatus}> · 계약 {p.contractAmount}</span>}
              </span>
              <span className={styles.simSim}>{Math.round(p.similarity * 100)}%</span>
            </a>
          ))}

          {/* 검수팁 — 유사 풀의 Q&A 요약을 통합(기존 /api/review-tips 재사용). 버튼을 눌러야 생성. */}
          {sims && sims.length > 0 && (
            <div className={styles.tips}>
              <div className={styles.tipsHeadRow}>
                <span className={styles.tipsHead}>검수팁</span>
                <button
                  className={styles.tipsBtn}
                  onClick={loadTips}
                  disabled={tipsLoading || (!mockMode && !normalized)}
                >
                  {tipsLoading ? "생성 중…" : tips ? "다시 생성" : "검수팁 생성"}
                </button>
              </div>
              {tipsError && <p className={styles.err}>{tipsError}</p>}
              {tipsLoading && !tips && <p className={styles.muted}>유사사례에서 뽑는 중…</p>}
              {!tipsLoading && !tips && !tipsError && (
                <p className={styles.muted}>필요할 때만 생성합니다.</p>
              )}
              {tips && (
                <>
                  {tips.risks.length > 0 && (
                    <TipGroup title="리스크" items={tips.risks} />
                  )}
                  {tips.questions.length > 0 && (
                    <TipGroup title="확인할 것" items={tips.questions} />
                  )}
                  {tips.technicalNotes.length > 0 && (
                    <TipGroup title="기술 쟁점" items={tips.technicalNotes} />
                  )}
                  {tips.risks.length === 0 &&
                    tips.questions.length === 0 &&
                    tips.technicalNotes.length === 0 && (
                      <p className={styles.muted}>건질 팁이 없어요.</p>
                    )}
                </>
              )}
            </div>
          )}
        </section>

        {/* 견적 — 기능수량·기간만 LLM 판단, 금액은 estimate-calc.ts가 결정적으로 계산 */}
        <section className={`${styles.panel} ${styles.panelWide}`}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>견적</span>
            <span className={styles.panelHint}>prompt.md 단가표 · 4단계 옵션</span>
          </div>
          {estLoading && <p className={styles.muted}>견적 산출 중…</p>}
          {estError && <p className={styles.err}>{estError}</p>}
          {!estLoading && !estError && !estimate && <p className={styles.muted}>분석을 실행하세요.</p>}
          {estimate && (
            <>
              <p className={styles.estType}>
                유형: <strong>{estimate.projectType}</strong>
                {estimate.typeReason && <span className={styles.estTypeReason}> — {estimate.typeReason}</span>}
              </p>
              <div className={styles.optionGrid}>
                {estimate.options.map((o) => (
                  <OptionCard key={o.key} option={o} />
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {/* 통화 녹취 불러오기 — 고객과 통화 후 내 최근 통화를 조회·다중선택. 아직 원문에 합치지 않는다(draft 생성은 다음 단계). */}
      <section className={`${styles.panel} ${styles.callsPanel}`}>
        <div className={styles.panelHead}>
          <span className={styles.panelTitle}>통화 녹취 불러오기</span>
          <span className={styles.panelHint}>고객과 통화 후 · 선택한 녹취만 보관</span>
        </div>
        <div className={styles.callsForm}>
          <div className={styles.lookupToggle}>
            <button
              type="button"
              className={lookupBy === "name" ? styles.lookupOn : styles.lookupOff}
              onClick={() => setLookupBy("name")}
              disabled={callsLoading}
            >
              이름으로
            </button>
            <button
              type="button"
              className={lookupBy === "phone" ? styles.lookupOn : styles.lookupOff}
              onClick={() => setLookupBy("phone")}
              disabled={callsLoading}
            >
              번호로
            </button>
          </div>
          {lookupBy === "name" ? (
            <input
              className={styles.callsInput}
              placeholder="매니저 이름 (남의 통화를 찾으려면 그 사람 이름)"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              disabled={callsLoading}
            />
          ) : (
            <input
              className={styles.callsInput}
              placeholder="고객 전화번호 (부분 입력 가능)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={callsLoading}
            />
          )}
          <button className={styles.runBtn} onClick={loadCalls} disabled={callsLoading}>
            {callsLoading ? "조회 중…" : "통화 불러오기"}
          </button>
        </div>
        {callsError && <p className={styles.err}>{callsError}</p>}
        {!callsLoading && !callsError && !calls && (
          <p className={styles.muted}>버튼을 눌러 최근 통화를 조회하세요.</p>
        )}
        {calls && calls.length === 0 && <p className={styles.muted}>조회된 통화가 없습니다.</p>}
        {calls && calls.length > 0 && (
          <div className={styles.callList}>
            {calls.map((c) => (
              <label key={c.id} className={styles.callRow}>
                <input
                  type="checkbox"
                  checked={selectedCalls.some((s) => s.id === c.id)}
                  onChange={() => toggleCallSelect(c)}
                />
                <div className={styles.callBody}>
                  <div className={styles.callMeta}>
                    {c.project_title && <span className={styles.callProject}>{c.project_title}</span>}
                    <span>{formatCallTime(c.created_at)}</span>
                    <span>{formatDuration(c.call_time_secs)}</span>
                  </div>
                  {c.summary && <p className={styles.callSummary}>{c.summary}</p>}
                  {c.transcript && (
                    <button
                      type="button"
                      className={styles.callDetailBtn}
                      // label 안이라 클릭이 체크박스로 전달된다 — 상세보기는 선택과 분리
                      onClick={(e) => {
                        e.preventDefault();
                        setViewCall(c);
                      }}
                    >
                      원문 보기
                    </button>
                  )}
                </div>
              </label>
            ))}
          </div>
        )}
        {selectedCalls.length > 0 && (
          <p className={styles.selectedHint}>{selectedCalls.length}건 선택됨</p>
        )}
      </section>

      {/* 공고문 draft — 의뢰 원문 + 고른 녹취를 합쳐 초안. 위 "공고문 미리보기"(워딩 불변)와
          같은 섹션 양식이라 둘을 나란히 두고 무엇이 다듬어졌는지 비교할 수 있다. */}
      <section className={`${styles.panel} ${styles.callsPanel}`}>
        <div className={styles.panelHead}>
          <span className={styles.panelTitle}>공고문 draft</span>
          <span className={styles.panelHint}>의뢰 원문 + 선택 녹취 · 워딩은 다듬되 없는 사실은 금지</span>
        </div>
        <div className={styles.callsForm}>
          <button
            className={styles.runBtn}
            onClick={loadDraft}
            disabled={draftLoading || (!mockMode && selectedCalls.length === 0)}
          >
            {draftLoading ? "작성 중…" : draft ? "다시 작성" : "공고문 draft 생성"}
          </button>
          <span className={styles.muted}>
            {selectedCalls.length > 0
              ? `선택한 통화 ${selectedCalls.length}건을 반영합니다`
              : "위에서 통화를 선택하면 활성화됩니다"}
          </span>
        </div>
        {draftError && <p className={styles.err}>{draftError}</p>}
        {draft && (
          <div className={styles.repostDoc}>
            {draft.sections.map((s) => {
              const missing = s.body.trim() === REPOST_MISSING;
              return (
                <div key={s.heading} className={styles.repostSection}>
                  <div className={styles.repostHeading}>[{s.heading}]</div>
                  <p className={`${styles.repostBody} ${missing ? styles.repostMissing : ""}`}>
                    {s.body}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 통화 원문 모달 — 조회 결과에 이미 들어있는 transcript 를 그대로 보여줄 뿐, 따로 안 불러온다 */}
      {viewCall && (
        <div className={styles.modalScrim} onClick={() => setViewCall(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <div>
                <div className={styles.modalTitle}>{viewCall.project_title ?? "통화 녹취"}</div>
                <div className={styles.callMeta}>
                  <span>{formatCallTime(viewCall.created_at)}</span>
                  <span>{formatDuration(viewCall.call_time_secs)}</span>
                </div>
              </div>
              <button type="button" className={styles.modalClose} onClick={() => setViewCall(null)}>
                닫기
              </button>
            </div>
            <div className={styles.modalBody}>
              {viewCall.summary && (
                <>
                  <div className={styles.modalLabel}>요약</div>
                  <p className={styles.modalSummary}>{viewCall.summary}</p>
                </>
              )}
              <div className={styles.modalLabel}>전문</div>
              <pre className={styles.modalTranscript}>{viewCall.transcript}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
