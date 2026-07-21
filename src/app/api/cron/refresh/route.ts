// Vercel Cron (하루 1회) — 신규 유입분 자동 파생 생성. 멱등(IS NULL만).
//   1) 원본 Q&A는 있는데 요약이 없는 프로젝트 → qna_summary 추출
//   2) embedding이 없는 프로젝트 → 공고문 임베딩
// 백필(대량 재추출)은 scripts/*.mjs 수동 실행 몫. 이 라우트는 매일 신규 소량만 소화한다.
// 한 실행이 시간예산 안에 다 못 끝내도 다음 날 이어서 처리된다(대상 쿼리가 IS NULL이라 자동 재개).

import { query } from "@/lib/db";
import { embedText } from "@/lib/embed";
import { extractQnaSummary, QNA_MODEL, type QnaThread } from "@/lib/qna-extract";
import type { QnaSummary } from "@/data/types";

export const maxDuration = 60;

const BUDGET_MS = 50_000; // 60s 한도 아래로 여유를 두고 새 작업 착수를 멈춘다
const QNA_LIMIT = 40; // 한 실행당 최대 요약 프로젝트 수
const QNA_CONCURRENCY = 4;
const EMBED_LIMIT = 60; // 한 실행당 최대 임베딩 프로젝트 수

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

export async function GET(req: Request): Promise<Response> {
  // Vercel Cron은 CRON_SECRET이 설정돼 있으면 Authorization: Bearer <CRON_SECRET>를 자동으로 붙인다.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

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
        await query(
          `INSERT INTO ai_insights (project_id, qna_summary, model, generated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (project_id) DO UPDATE
             SET qna_summary = EXCLUDED.qna_summary, model = EXCLUDED.model, generated_at = now()`,
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

  return Response.json({
    qna: { targets: qnaTargets.length, done: qnaDone, fail: qnaFail },
    embed: { done: embDone, fail: embFail },
  });
}
