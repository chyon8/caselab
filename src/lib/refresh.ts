// 신규 유입분 자동 파생 생성 — cron(/api/cron/refresh)과 수동 버튼(/api/refresh-now)이 공유하는 본체.
//   1) 원본 Q&A는 있는데 요약이 없는 프로젝트 → qna_summary 추출
//   2) embedding이 없는 프로젝트 → 공고문 임베딩
//   3) 추출이 없는 사전 미팅 녹취 → meetings.ai_extract
//   4) 추출이 없거나 노트 수가 바뀐 프로젝트 → ai_insights.note_extract
//   5) 리스크 문장은 있는데 태그가 없는 프로젝트 → ai_insights.risk_tags
//   6) 취소로 끝났는데 사유 태그가 없는 프로젝트 → ai_insights.cancel_tags
//   7) 결판났는데 공급난이도 태그가 없는 프로젝트 → ai_insights.supply_tags
// 백필(대량 재추출)은 scripts/*.mjs 수동 실행 몫. 이건 신규 소량만 소화한다.
// 시간예산 안에 다 못 끝내도 다음 실행에서 이어진다(대상 쿼리가 IS NULL/변화감지라 자동 재개).

import { query } from "@/lib/db";
import { embedText } from "@/lib/embed";
import {
  extractMeeting,
  MIN_TRANSCRIPT_CHARS,
  type MeetingInput,
} from "@/lib/meeting-extract";
import { extractManagenotes, NOTE_MODEL, type NoteItem } from "@/lib/managenote-extract";
import { extractQnaSummary, QNA_MODEL, type QnaThread } from "@/lib/qna-extract";
import { tagRiskSignals } from "@/lib/risk-tags";
import { tagCancelReasons } from "@/lib/cancel-tags";
import { tagSupplyTraits } from "@/lib/supply-tags";
import type { ManagenoteExtract, MeetingExtract, QnaSummary } from "@/data/types";

const BUDGET_MS = 50_000; // 60s 함수 한도 아래로 여유를 두고 새 작업 착수를 멈춘다
const QNA_LIMIT = 40; // 한 실행당 최대 요약 프로젝트 수
const QNA_CONCURRENCY = 4;
const EMBED_LIMIT = 60; // 한 실행당 최대 임베딩 프로젝트 수
// 미팅 녹취는 건당 3만자라 qna보다 한참 무겁다 — 한 실행당 소량만, 나머지는 다음 실행에서.
const MEETING_LIMIT = 6;
// 노트는 건당 100~150자라 프로젝트 하나를 통째로 넣어도 가볍다 — qna와 같은 규모로 돈다.
const NOTE_LIMIT = 30;
const NOTE_CONCURRENCY = 4;
// 리스크 태깅은 입력이 문장 두세 개뿐이라 가장 가볍다
const RISK_LIMIT = 40;
const RISK_CONCURRENCY = 4;
const CANCEL_LIMIT = 30;
const CANCEL_CONCURRENCY = 4;
// 공급난이도는 판정이 까다로워 상위 모델을 쓴다(mini는 부정 제약을 못 지킨다 — 실측).
// 건당 비용이 커서 한 실행당 소량만 돈다.
const SUPPLY_LIMIT = 20;
const SUPPLY_CONCURRENCY = 4;

interface QnaTarget {
  project_id: string;
  title: string;
  threads: QnaThread[];
}

interface EmbedTarget {
  id: string;
  title: string;
  posting_raw: string;
}

interface NoteTarget {
  project_id: string;
  title: string;
  notes: NoteItem[];
}

interface MeetingRow {
  id: string;
  partner_slug: string | null;
  summary: string | null;
  transcript: string;
  title: string;
}

interface RiskTarget {
  project_id: string;
  title: string;
  signals: string[];
}

interface CancelTarget {
  project_id: string;
  title: string;
  outcomes: string[];
}

interface SupplyTarget {
  id: string;
  title: string;
  tech: string | null;
  category: string | null;
  posting_raw: string | null;
}

export interface RefreshResult {
  qna: { targets: number; done: number; fail: number };
  embed: { done: number; fail: number };
  meeting: { targets: number; done: number; fail: number };
  note: { targets: number; done: number; fail: number };
  risk: { targets: number; done: number; fail: number };
  cancel: { targets: number; done: number; fail: number };
  supply: { targets: number; done: number; fail: number };
}

export async function runRefresh(): Promise<RefreshResult> {
  const deadline = Date.now() + BUDGET_MS;

  // 1) Q&A 요약 대상:
  //    ① 요약 없음(신규) ② technicalNotes 없는 구버전 ③ 요약 후 댓글 수가 바뀜(개수 변화 재분석).
  //    ③은 sourceCount가 있는 요약만 비교 → sourceCount 없는 기존 요약을 대량 재처리하지 않는다.
  const qnaTargets = await query<QnaTarget>(
    `SELECT g.project_id, g.title, g.threads
       FROM (
         SELECT t.project_id, p.title,
                json_agg(json_build_object('title', left(t.title,700), 'body', left(t.body,700), 'by', t.meta->>'by')) AS threads,
                count(*) AS cnt
           FROM timeline_events t
           JOIN projects p ON p.id = t.project_id
          WHERE t.source = 'qna' AND t.title IS NOT NULL
            AND p.deleted_at IS NULL AND p.hidden = false
          GROUP BY t.project_id, p.title
       ) g
       LEFT JOIN ai_insights ai ON ai.project_id = g.project_id
      WHERE ai.qna_summary IS NULL
         OR ai.qna_summary->'technicalNotes' IS NULL
         OR (ai.qna_summary ? 'sourceCount' AND g.cnt <> (ai.qna_summary->>'sourceCount')::int)
      LIMIT $1`,
    [QNA_LIMIT],
  );

  let qnaDone = 0;
  let qnaFail = 0;
  let next = 0;
  async function qnaWorker(): Promise<void> {
    while (next < qnaTargets.length && Date.now() < deadline) {
      const r = qnaTargets[next++];
      try {
        const summary: QnaSummary = await extractQnaSummary(r.title, r.threads);
        // risk_tags를 NULL로 되돌린다 — 요약이 새로 나왔으면 그 태그는 옛 문장에 붙은 것이다.
        // 5단계가 NULL을 대상으로 잡으므로 다음 실행에서 알아서 다시 태깅된다.
        await query(
          `INSERT INTO ai_insights (project_id, qna_summary, model, generated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (project_id) DO UPDATE
             SET qna_summary = EXCLUDED.qna_summary, model = EXCLUDED.model,
                 risk_tags = NULL, generated_at = now()`,
          [r.project_id, JSON.stringify(summary), QNA_MODEL],
        );
        qnaDone++;
      } catch {
        qnaFail++;
      }
    }
  }
  await Promise.all(Array.from({ length: QNA_CONCURRENCY }, qnaWorker));

  // 2) 임베딩 — scripts/embed-projects.mjs와 같은 대상 조건. 남은 시간이 있을 때만.
  let embDone = 0;
  let embFail = 0;
  if (Date.now() < deadline) {
    const embTargets = await query<EmbedTarget>(
      `SELECT id, title, posting_raw
         FROM projects
        WHERE embedding IS NULL AND posting_raw IS NOT NULL
          AND deleted_at IS NULL AND hidden = false
        ORDER BY id
        LIMIT $1`,
      [EMBED_LIMIT],
    );
    for (const r of embTargets) {
      if (Date.now() >= deadline) break;
      try {
        const vec = await embedText(`${r.title}\n\n${r.posting_raw}`);
        await query(`UPDATE projects SET embedding = $2::vector WHERE id = $1`, [
          r.id,
          `[${vec.join(",")}]`,
        ]);
        embDone++;
      } catch {
        embFail++;
      }
    }
  }

  // 3) 사전 미팅 녹취 추출 — 대상 조건은 scripts/extract-meetings.mjs와 같다.
  //    껍데기 녹취(500자 미만)는 제외하고, 녹취가 갱신돼 길이가 달라진 건은 다시 뽑는다.
  const meetTargets =
    Date.now() < deadline
      ? await query<MeetingRow>(
          `SELECT m.id, m.partner_slug, m.summary, m.transcript, p.title
             FROM meetings m
             JOIN projects p ON p.id = m.project_id
            WHERE m.transcript IS NOT NULL AND length(m.transcript) >= $2
              AND (m.ai_extract IS NULL
                   OR (m.ai_extract ? 'sourceLen'
                       AND (m.ai_extract->>'sourceLen')::int <> length(m.transcript)))
            ORDER BY m.created_at DESC
            LIMIT $1`,
          [MEETING_LIMIT, MIN_TRANSCRIPT_CHARS],
        )
      : [];

  let meetDone = 0;
  let meetFail = 0;
  for (const m of meetTargets) {
    if (Date.now() >= deadline) break;
    try {
      const x: MeetingExtract = await extractMeeting({
        projectTitle: m.title,
        partnerSlug: m.partner_slug,
        summary: m.summary,
        transcript: m.transcript,
      } satisfies MeetingInput);
      await query(`UPDATE meetings SET ai_extract = $2 WHERE id = $1`, [m.id, JSON.stringify(x)]);
      meetDone++;
    } catch {
      meetFail++;
    }
  }

  // 4) 매니저 노트 추출 — 대상 조건은 scripts/extract-managenotes.mjs와 같다.
  //    노트 수가 늘면 다시 뽑는다(qna의 sourceCount 변화 감지와 같은 방식).
  const noteTargets =
    Date.now() < deadline
      ? await query<NoteTarget>(
          `SELECT g.project_id, g.title, g.notes
             FROM (
               SELECT t.project_id, p.title, count(*)::int AS cnt,
                      json_agg(json_build_object(
                        'at',   to_char(t.event_at, 'MM-DD'),
                        'kind', t.title,
                        'by',   t.meta->>'by',
                        'body', t.body
                      ) ORDER BY t.event_at) AS notes
                 FROM timeline_events t
                 JOIN projects p ON p.id = t.project_id
                WHERE t.source = 'managenote' AND t.body IS NOT NULL AND length(t.body) > 0
                  AND p.deleted_at IS NULL AND p.hidden = false
                GROUP BY t.project_id, p.title
             ) g
             LEFT JOIN ai_insights ai ON ai.project_id = g.project_id
            WHERE ai.note_extract IS NULL
               OR (ai.note_extract->>'sourceCount')::int <> g.cnt
            LIMIT $1`,
          [NOTE_LIMIT],
        )
      : [];

  let noteDone = 0;
  let noteFail = 0;
  let noteNext = 0;
  async function noteWorker(): Promise<void> {
    while (noteNext < noteTargets.length && Date.now() < deadline) {
      const r = noteTargets[noteNext++];
      try {
        const x: ManagenoteExtract = await extractManagenotes(r.title, r.notes);
        await query(
          `INSERT INTO ai_insights (project_id, note_extract, model, generated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (project_id) DO UPDATE
             SET note_extract = EXCLUDED.note_extract, model = EXCLUDED.model,
                 cancel_tags = NULL, generated_at = now()`,
          [r.project_id, JSON.stringify(x), NOTE_MODEL],
        );
        noteDone++;
      } catch {
        noteFail++;
      }
    }
  }
  await Promise.all(Array.from({ length: NOTE_CONCURRENCY }, noteWorker));

  // 5) 리스크 태깅 — 대상 조건은 scripts/tag-risks.mjs와 같다.
  //    리스크 문장이 0개인 프로젝트는 아예 대상이 아니라(태그도 NULL로 남는다) 매번 다시 집히지 않는다.
  //    qna_summary가 다시 뽑히면 위 1단계가 risk_tags를 NULL로 되돌려 여기서 다시 태깅된다.
  const riskTargets =
    Date.now() < deadline
      ? await query<RiskTarget>(
          `SELECT ai.project_id, p.title,
                  ARRAY(SELECT jsonb_array_elements_text(ai.qna_summary->'riskSignals')) AS signals
             FROM ai_insights ai
             JOIN projects p ON p.id = ai.project_id
            WHERE ai.risk_tags IS NULL
              AND ai.qna_summary IS NOT NULL
              AND jsonb_array_length(ai.qna_summary->'riskSignals') > 0
              AND p.deleted_at IS NULL AND p.hidden = false
            LIMIT $1`,
          [RISK_LIMIT],
        )
      : [];

  let riskDone = 0;
  let riskFail = 0;
  let riskNext = 0;
  async function riskWorker(): Promise<void> {
    while (riskNext < riskTargets.length && Date.now() < deadline) {
      const r = riskTargets[riskNext++];
      try {
        const tags = await tagRiskSignals(r.title, r.signals);
        await query(`UPDATE ai_insights SET risk_tags = $2 WHERE project_id = $1`, [
          r.project_id,
          tags,
        ]);
        riskDone++;
      } catch {
        riskFail++;
      }
    }
  }
  await Promise.all(Array.from({ length: RISK_CONCURRENCY }, riskWorker));

  // 6) 취소 사유 태깅 — 대상 조건은 scripts/tag-cancels.mjs와 같다.
  //    노트 추출이 갱신되면(note_extract 재생성) 4단계가 cancel_tags를 NULL로 되돌려 다시 태깅된다.
  const cancelTargets =
    Date.now() < deadline
      ? await query<CancelTarget>(
          `SELECT ai.project_id, p.title,
                  ARRAY(SELECT jsonb_array_elements_text(ai.note_extract->'outcome')) AS outcomes
             FROM ai_insights ai
             JOIN projects p ON p.id = ai.project_id
            WHERE ai.cancel_tags IS NULL
              AND ai.note_extract IS NOT NULL
              AND jsonb_array_length(ai.note_extract->'outcome') > 0
              AND p.status = '완료(취소)'
              AND p.deleted_at IS NULL AND p.hidden = false
            LIMIT $1`,
          [CANCEL_LIMIT],
        )
      : [];

  let cancelDone = 0;
  let cancelFail = 0;
  let cancelNext = 0;
  async function cancelWorker(): Promise<void> {
    while (cancelNext < cancelTargets.length && Date.now() < deadline) {
      const r = cancelTargets[cancelNext++];
      try {
        const tags = await tagCancelReasons(r.title, r.outcomes);
        await query(`UPDATE ai_insights SET cancel_tags = $2 WHERE project_id = $1`, [
          r.project_id,
          tags,
        ]);
        cancelDone++;
      } catch {
        cancelFail++;
      }
    }
  }
  await Promise.all(Array.from({ length: CANCEL_CONCURRENCY }, cancelWorker));

  // 7) 공급난이도 태깅 — 대상 조건은 scripts/tag-supply.mjs와 같다.
  //    결판난 건만 본다(지원자 수가 확정돼야 저지원 비율에 쓸 수 있다).
  const supplyTargets =
    Date.now() < deadline
      ? await query<SupplyTarget>(
          `SELECT p.id, p.title, p.tech, p.category, p.posting_raw
             FROM projects p
             LEFT JOIN ai_insights ai ON ai.project_id = p.id
            WHERE ai.supply_tags IS NULL
              AND p.deleted_at IS NULL AND p.hidden = false
              AND ((p.stage >= 3 AND p.status <> '완료(취소)') OR p.status = '완료(취소)')
            ORDER BY p.recruit_started_at DESC NULLS LAST
            LIMIT $1`,
          [SUPPLY_LIMIT],
        )
      : [];

  let supplyDone = 0;
  let supplyFail = 0;
  let supplyNext = 0;
  async function supplyWorker(): Promise<void> {
    while (supplyNext < supplyTargets.length && Date.now() < deadline) {
      const r = supplyTargets[supplyNext++];
      try {
        const tags = await tagSupplyTraits({
          title: r.title,
          tech: r.tech,
          category: r.category,
          posting: r.posting_raw,
        });
        await query(
          `INSERT INTO ai_insights (project_id, supply_tags) VALUES ($1, $2)
           ON CONFLICT (project_id) DO UPDATE SET supply_tags = EXCLUDED.supply_tags`,
          [r.id, tags],
        );
        supplyDone++;
      } catch {
        supplyFail++;
      }
    }
  }
  await Promise.all(Array.from({ length: SUPPLY_CONCURRENCY }, supplyWorker));

  return {
    qna: { targets: qnaTargets.length, done: qnaDone, fail: qnaFail },
    embed: { done: embDone, fail: embFail },
    meeting: { targets: meetTargets.length, done: meetDone, fail: meetFail },
    note: { targets: noteTargets.length, done: noteDone, fail: noteFail },
    risk: { targets: riskTargets.length, done: riskDone, fail: riskFail },
    cancel: { targets: cancelTargets.length, done: cancelDone, fail: cancelFail },
    supply: { targets: supplyTargets.length, done: supplyDone, fail: supplyFail },
  };
}
