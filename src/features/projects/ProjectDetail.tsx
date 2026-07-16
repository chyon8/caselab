"use client";

import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { CHECK_ITEMS } from "@/data/mock-data";
import type { CallRecord, IssueType, Project, ProjectFull } from "@/data/types";
import { useApp } from "@/state/AppContext";
import st from "./status.module.css";
import { STATUS_KEY, statusLabel } from "./status";
import styles from "./ProjectDetail.module.css";

const STAGES = ["검수", "모집", "계약체결중", "프로젝트 진행", "완료"];

const ISSUE_TAG_KEY: Record<IssueType, string> = {
  이슈: "issue",
  "과업 범위": "scope",
  "예산 언급": "budget",
  일정: "schedule",
  "법무·보안": "legal",
  합의: "agree",
};

/** 본진 project_project.planning_status — 값이 늘어나면 원문 그대로 보여준다 */
const PLANNING_LABEL: Record<string, string> = {
  idea: "아이디어 단계",
  detail: "상세 기획 있음",
  document: "기획서 보유",
};

/**
 * 스테퍼 아래 한 줄 — 단계별 소요일.
 *
 * 아직 도달하지 않은 단계(null)와 **0일 구간은 표시하지 않는다.**
 * 실데이터에서 검수의 74%가 0일(당일 통과)이라, 0을 찍으면 4,465건에 정보 없는 줄이 붙는다.
 * 0일은 소요 시간이 아니라 "즉시 통과"라는 뜻이므로 빼는 게 맞다 —
 * 그래야 "검수 21일"처럼 실제로 지연된 건만 눈에 띈다.
 */
function durationSpans(p: Project): { label: string; days: number }[] {
  const d = p.durations;
  if (!d) return [];
  const canceled = p.status === "완료(취소)";
  const rows: [string, number | null][] = [
    ["검수", d.inspection],
    ["모집·계약", d.recruiting],
    ["진행", d.progress],
    [canceled ? "취소까지" : "총 기간", d.total],
  ];
  return rows
    .filter((r): r is [string, number] => r[1] !== null && r[1] > 0)
    .map(([label, days]) => ({ label, days }));
}

/** 제목 아래 한 줄 — 개발 범위·턴키·기획자료·지원자 수 */
function specChips(p: Project): string[] {
  const chips = [...(p.devScope ?? [])];
  if (p.isTurnkey) chips.push("턴키");
  if (p.planningStatus) {
    chips.push(PLANNING_LABEL[p.planningStatus] ?? p.planningStatus);
  }
  if (p.proposalCount != null) chips.push(`지원 ${p.proposalCount}건`);
  return chips;
}

/** 인라인 마크다운(**굵게**, [텍스트](url))만 React 노드로 변환. 나머지는 평문. */
function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(<strong key={key++}>{m[1]}</strong>);
    } else {
      nodes.push(
        <a key={key++} href={m[3]} target="_blank" rel="noreferrer">
          {m[2]}
        </a>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * 미팅 회의록(마크다운) 렌더. 통화 STT와 달리 미팅 전문은 `# 회의록 / ## 요약 / **굵게** /
 * [링크](url)` 형식 마크다운이라, 날것 텍스트 대신 제목·목록·문단으로 읽기 좋게 그린다.
 * 외부 의존성 없이 이 문서가 쓰는 최소 문법(제목·불릿·굵게·링크)만 처리한다.
 */
function MeetingTranscript({ md }: { md: string }) {
  const blocks: React.ReactNode[] = [];
  md.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push(
        <div key={i} className={styles[`md-h${h[1].length}`]}>
          {renderInline(h[2])}
        </div>,
      );
      return;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      blocks.push(
        <div key={i} className={styles["md-li"]}>
          {renderInline(li[1])}
        </div>,
      );
      return;
    }
    blocks.push(
      <p key={i} className={styles["md-p"]}>
        {renderInline(line)}
      </p>,
    );
  });
  return <div className={styles["md-body"]}>{blocks}</div>;
}

/** 사전 미팅 녹취록 카드 — 개발사별로 여러 건이라 카드마다 토글 상태가 독립이어야 한다. */
function MeetingCard({ meeting }: { meeting: CallRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles["meeting-card"]}>
      <div className={styles["meeting-head"]}>
        <div className={styles["meeting-title"]}>
          {meeting.title} <span className={styles["meeting-date"]}>· {meeting.date}</span>
        </div>
        <span className={styles["ai-badge"]}>AI 요약</span>
      </div>
      {meeting.summary.length > 0 && (
        <div className={styles["summary-list"]}>
          {meeting.summary.map((m, i) => (
            <div key={i} className={styles["summary-row"]}>
              <div className={styles.bullet} />
              <div className={styles["summary-text"]}>{m}</div>
            </div>
          ))}
        </div>
      )}
      {meeting.matchReason && (
        <div className={styles["match-reason"]}>
          <span className={styles["match-reason-label"]}>매칭 근거</span>
          {meeting.matchReason}
        </div>
      )}
      {(meeting.lines.length > 0 || meeting.transcript) && (
        <>
          <button className={styles["transcript-btn"]} onClick={() => setOpen((v) => !v)}>
            {open ? "전체 녹취록 접기 ↑" : "전체 녹취록 보기 ↓"}
          </button>
          {open &&
            (meeting.lines.length > 0 ? (
              <div className={styles.transcript}>
                {meeting.lines.map((l, i) => (
                  <div key={i} className={styles["t-row"]}>
                    <div className={styles["t-time"]}>{l.t}</div>
                    <div className={styles["t-who"]}>{l.who}</div>
                    <div className={styles["t-text"]}>{l.text}</div>
                  </div>
                ))}
              </div>
            ) : (
              meeting.transcript && <MeetingTranscript md={meeting.transcript} />
            ))}
        </>
      )}
    </div>
  );
}

export default function ProjectDetail({ project: p }: { project: ProjectFull }) {
  const router = useRouter();
  const app = useApp();
  const saved = app.reviews[p.id];

  const [showIntake, setShowIntake] = useState(false);
  const [draftChecks, setDraftChecks] = useState<boolean[]>(
    saved ? [...saved.checks] : [false, false, false, false]
  );
  const [draftComment, setDraftComment] = useState(saved ? saved.comment : "");
  const [justSaved, setJustSaved] = useState(false);

  const canceled = p.status === "완료(취소)";
  const isDone = p.status.startsWith("완료");
  const posting = p.intake.posting;
  const specs = specChips(p);
  const spans = durationSpans(p);

  const toggleCheck = (i: number) => {
    setDraftChecks((c) => c.map((v, idx) => (idx === i ? !v : v)));
    setJustSaved(false);
  };

  const saveReview = () => {
    app.saveReview(p.id, {
      checks: [...draftChecks],
      comment: draftComment,
      savedAt: "방금 전",
    });
    setJustSaved(true);
  };

  const badgeSaved = justSaved || !!saved;
  const badgeText = justSaved
    ? "저장됨 · 방금 전"
    : saved
      ? `저장됨 · ${saved.savedAt}`
      : "작성 대기";

  return (
    <div className={styles.container}>
      <button onClick={() => router.back()} className={styles["back-btn"]} style={{ background: 'none', fontFamily: 'inherit', cursor: 'pointer' }}>
        <span className={styles["back-arrow"]}>←</span> 전체 프로젝트
      </button>

      <div className={styles["admin-links"]}>
        <a
          href={`https://www.wishket.com/manage/project/inspection/detail/${p.id}`}
          target="_blank"
          rel="noreferrer"
          className={styles["admin-link"]}
        >
          검수 어드민 ↗
        </a>
        <a
          href={`https://www.wishket.com/card_admin/project/${p.id}`}
          target="_blank"
          rel="noreferrer"
          className={styles["admin-link"]}
        >
          카드 어드민 ↗
        </a>
        {/* 계약 어드민만 project.id가 아니라 agreement.id를 쓴다. 계약 전이면 링크가 없다 */}
        {p.agreementId && (
          <a
            href={`https://www.wishket.com/card_admin/agreement/${p.agreementId}/`}
            target="_blank"
            rel="noreferrer"
            className={styles["admin-link"]}
          >
            계약 어드민 ↗
          </a>
        )}
      </div>

      <div className={styles["head-row"]}>
        <div>
          <h1 className={styles.title}>{p.name}</h1>
          <div className={styles.meta}>
            {p.client} · 검수담당 {p.manager} · {p.tech}
          </div>
          {specs.length > 0 && (
            <div className={styles["spec-row"]}>
              {specs.map((s) => (
                <span key={s} className={styles["spec-chip"]}>
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
        <span className={`${st.chip} ${st[STATUS_KEY[p.status]]}`}>
          현재 단계: {statusLabel(p.status)}
        </span>
      </div>

      <div className={styles.stepper}>
        {STAGES.map((label, i) => {
          const n = i + 1;
          const isLast = n === 5 && p.stage === 5;
          const done = n < p.stage || isLast;
          const cur = n === p.stage && p.stage < 5;
          const circleClass = isLast
            ? canceled
              ? styles.cancelled
              : styles.done
            : done
              ? styles.done
              : cur
                ? styles.current
                : "";
          const mark = isLast ? (canceled ? "✕" : "✓") : done ? "✓" : String(n);
          return (
            <Fragment key={label}>
              {i > 0 && (
                <div
                  className={`${styles["step-line"]} ${n <= p.stage ? styles.reached : ""}`}
                />
              )}
              <div className={styles.step}>
                <div className={`${styles.circle} ${circleClass}`}>{mark}</div>
                <div
                  className={`${styles["step-label"]} ${done || cur ? styles.reached : ""} ${cur ? styles.current : ""}`}
                >
                  {label}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>

      {spans.length > 0 && (
        <div className={styles["span-row"]}>
          {spans.map((s) => (
            <div key={s.label} className={styles.span}>
              <span className={styles["span-label"]}>{s.label}</span>
              <span className={styles["span-value"]}>{s.days}일</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles["posting-accordion"]}>
        <button
          className={styles["posting-header"]}
          onClick={() => setShowIntake((v) => !v)}
          aria-expanded={showIntake}
        >
          <span className={styles["posting-header-left"]}>
            <span className={styles["posting-header-title"]}>검수 공고문</span>
            <span className={styles["ai-badge"]}>AI 생성 초안</span>
          </span>
          <span className={styles["posting-header-right"]}>
            {showIntake ? "접기" : "펼치기"}
            <span className={`${styles.chevron} ${showIntake ? styles.open : ""}`}>
              ▾
            </span>
          </span>
        </button>

        {showIntake && (
          <div className={styles["posting-content"]}>
            <div className={styles["posting-title"]}>{posting.title}</div>

            <section className={styles["posting-section"]}>
              <div className={styles.eyebrow}>프로젝트 배경 및 목표</div>
              <p className={styles["posting-para"]}>{posting.background}</p>
            </section>

            <section className={styles["posting-section"]}>
              <div className={styles.eyebrow}>과업 범위</div>
              <div className={styles["sub-label"]}>1. 수행 범위</div>
              <ul className={styles.bullets}>
                {posting.scopeSummary.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
              <div className={styles["sub-label"]}>2. 상세 기능 요구 사항</div>
              <div className={styles["feature-groups"]}>
                {posting.featureGroups.map((fg) => (
                  <div key={fg.heading}>
                    <div className={styles["group-heading"]}>{fg.heading}</div>
                    <ul className={styles.bullets}>
                      {fg.items.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className={styles["sub-label"]}>3. 비기능적 요구사항</div>
              <ul className={styles.bullets}>
                {posting.nonFunctional.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>

            <section className={styles["posting-section"]}>
              <div className={styles.eyebrow}>기술 스택</div>
              <ul className={styles.bullets}>
                {posting.techStack.map((ts) => (
                  <li key={ts}>{ts}</li>
                ))}
              </ul>
            </section>

            <section className={styles["posting-section"]}>
              <div className={styles.eyebrow}>주요 일정</div>
              <ul className={styles.bullets}>
                <li>희망 착수일: {posting.schedule.start}</li>
                {posting.schedule.milestones.map((m) => (
                  <li key={m}>{m}</li>
                ))}
                <li>최종 오픈(납품) 희망일: {posting.schedule.due}</li>
              </ul>
            </section>

            <section className={styles["posting-section"]}>
              <div className={styles.eyebrow}>지원 자격 및 우대 사항</div>
              <div className={styles["sub-label"]}>지원 자격</div>
              <ul className={styles.bullets}>
                {posting.qualRequired.map((qr) => (
                  <li key={qr}>{qr}</li>
                ))}
              </ul>
              <div className={styles["sub-label"]}>우대 사항</div>
              <ul className={styles.bullets}>
                {posting.qualPreferred.map((qp) => (
                  <li key={qp}>{qp}</li>
                ))}
              </ul>
            </section>

            <section className={styles["posting-section-last"]}>
              <div className={styles.eyebrow}>산출물</div>
              <ul className={styles.bullets}>
                {posting.deliverables.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </div>

      <div className={styles["budget-grid"]}>
        <div className={styles["budget-card"]}>
          <div className={styles["budget-label"]}>검수 예산</div>
          <div className={styles["budget-value"]}>
            {p.budget || "미정"}
            {p.period ? ` · ${p.period}` : ""}
          </div>
        </div>
        <div className={styles["budget-card"]}>
          <div className={styles["budget-label"]}>계약 예산</div>
          <div className={styles["budget-value"]}>
            {p.contractAmount
              ? `${p.contractAmount}${p.contractPeriod ? ` · ${p.contractPeriod}` : ""}`
              : p.cancel
                ? "미체결"
                : "계약 전"}
          </div>
        </div>
      </div>

      {p.cancel ? (
        <div className={styles["cancel-card"]}>
          <div className={styles["cancel-title"]}>
            중도 취소 — 발생 단계: {p.cancel.stage}
          </div>
          <div className={styles["cancel-reason"]}>{p.cancel.reason}</div>
        </div>
      ) : (
        <div className={styles.spacer} />
      )}

      <div className={styles["section-head"]}>
        <span className={styles["section-title"]}>사전 미팅 이슈 로그</span>
        <span className={styles["section-sub"]}>
          {" "}
          — 모집 단계 개발사 미팅 녹취록에서 발췌 · 시간순
        </span>
      </div>
      <div className={styles.hint}>
        유형: 이슈 · 과업 범위 · 예산 언급 · 일정 · 법무·보안 · 합의
      </div>
      {p.issueLog.length > 0 ? (
        <div className={styles["issue-list"]}>
          {p.issueLog.map((e, i) => (
            <div key={i} className={styles["issue-row"]}>
              <span className={`${styles["issue-tag"]} ${styles[ISSUE_TAG_KEY[e.type]]}`}>
                {e.type}
              </span>
              <div className={styles["issue-body"]}>
                <div className={styles["issue-text"]}>{e.text}</div>
                <div className={styles["issue-src"]}>
                  {e.src} · {e.date}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`${styles.placeholder} ${styles.gap}`}>
          모집 단계 사전 미팅이 시작되면 녹취록 발췌 기반 이슈 로그가 이곳에 쌓입니다.
        </div>
      )}

      {p.meetings && p.meetings.length > 0 && (
        <>
          <div className={`${styles["section-head"]} ${styles.wide}`}>
            <span className={styles["section-title"]}>사전 미팅 녹취록</span>
            <span className={styles["section-sub"]}>
              {" "}
              — 모집 단계 개발사 미팅 · AI 자동 요약 · {p.meetings.length}건
            </span>
          </div>
          {p.meetings.map((m, i) => (
            <MeetingCard key={i} meeting={m} />
          ))}
        </>
      )}

      {/* 통화 녹취 UI는 보류 (2026-07-15). 매핑 신뢰도 문제로 화면에서 숨김 — 데이터는 calls 테이블에 보존.
          되살리려면 이 자리에 CallCard 렌더를 복원하면 된다 (git history: cd98580 이전). */}

      {p.qna.length > 0 && (
        <>
          <div className={styles["section-head"]}>
            <span className={styles["section-title"]}>개발사 Q&A</span>
          </div>
          <div className={styles["qna-list"]}>
            {p.qna.map((q, i) => (
              <div key={i} className={styles["qna-row"]}>
                <span className={styles["q-mark"]}>Q</span>
                <div className={styles["issue-body"]}>
                  <div className={styles["qna-q"]}>{q.q}</div>
                  {q.a && <div className={styles["qna-a"]}>{q.a}</div>}
                  <div className={styles["qna-by"]}>
                    {q.by} · {q.at}
                    {q.isPrivate && <span className={styles["qna-private"]}>비공개</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className={`${styles["section-head"]} ${styles.timeline}`}>
        <span className={styles["section-title"]}>타임라인</span>
      </div>
      <div className={styles["tl-list"]}>
        {p.timeline.map((e, i) => (
          <div key={i} className={styles["tl-row"]}>
            <div className={styles["tl-rail-col"]}>
              <div className={`${styles["tl-dot"]} ${e.cancel ? styles.cancel : ""}`} />
              {i < p.timeline.length - 1 && <div className={styles["tl-rail"]} />}
            </div>
            <div className={styles["tl-body"]}>
              <div className={styles["tl-meta-row"]}>
                <span className={`${styles["stage-tag"]} ${e.cancel ? styles.cancel : ""}`}>
                  {e.stage}
                </span>
                <span className={styles["tl-date"]}>{e.date}</span>
              </div>
              <div className={`${styles["tl-title"]} ${e.cancel ? styles.cancel : ""}`}>
                {e.title}
              </div>
              <div className={styles["tl-desc"]}>{e.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {isDone ? (
        <div className={styles["review-panel"]}>
          <div className={styles["review-head"]}>
            <div className={styles["review-title"]}>완료 리뷰 — 케이스 내재화</div>
            <span
              className={`${styles["review-badge"]} ${badgeSaved ? styles.saved : styles.pending}`}
            >
              {badgeText}
            </span>
          </div>
          <div className={styles["review-sub"]}>
            체크리스트와 코멘트를 작성하면 팀 전체가 검색·참고 가능한 사례로 축적됩니다.
          </div>
          <div className={styles["check-list"]}>
            {CHECK_ITEMS.map((label, i) => (
              <div key={label} className={styles["check-row"]} onClick={() => toggleCheck(i)}>
                <div className={`${styles["check-box"]} ${draftChecks[i] ? styles.on : ""}`}>
                  {draftChecks[i] ? "✓" : ""}
                </div>
                <div className={styles["check-label"]}>{label}</div>
              </div>
            ))}
          </div>
          <textarea
            className={styles["review-textarea"]}
            value={draftComment}
            onChange={(e) => {
              setDraftComment(e.target.value);
              setJustSaved(false);
            }}
            placeholder="코멘트 — 다음 유사 프로젝트 검수 시 알아야 할 것들을 남겨주세요"
          />
          <button className={styles["save-btn"]} onClick={saveReview}>
            리뷰 저장
          </button>
        </div>
      ) : (
        <div className={styles.placeholder}>
          완료 전환 시 이 영역에 체크리스트 + 코멘트 리뷰가 활성화됩니다. (검수 컨설턴트에게
          알림 발송)
        </div>
      )}
    </div>
  );
}
