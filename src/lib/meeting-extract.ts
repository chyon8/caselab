// 사전 미팅 녹취(매니저·클라이언트·개발사 3자) → 검수용 고정 스키마 추출. gpt-4o-mini, JSON 강제.
// ⚠️ scripts/extract-meetings.mjs에 백필용 병렬 사본이 있다 — 프롬프트를 고치면 양쪽을 맞춰야 한다.

import type { MeetingExtract } from "@/data/types";

export const MEETING_MODEL = "gpt-4o-mini";

/**
 * 한 번에 넣을 녹취 길이 상한. 실데이터(134건) 중앙값이 28,400자라 대부분 1청크로 끝나고,
 * 최장 165,441자짜리만 3청크가 된다. gpt-4o-mini 컨텍스트(128k 토큰) 아래로 여유를 둔 값 —
 * 자르지 않고 전량을 반영하기 위한 분할이다.
 */
const CHUNK_CHARS = 60_000;

/** 껍데기 녹취(제목·머리말만 있고 발화가 없는 건) 컷 — LLM을 칠 가치가 없다 */
export const MIN_TRANSCRIPT_CHARS = 500;

const SYSTEM = `너는 위시켓 프로젝트 "검수 매니저"를 돕는 어시스턴트다.
모집 단계에서 진행된 사전 미팅 녹취(매니저·클라이언트·개발사 3자 대화)를 받아,
검수 매니저가 "무엇이 정해졌고 무엇이 남았나"를 파악하는 데 필요한 것만 남긴다.

반드시 버릴 노이즈: 인사·자기소개·회사 소개·수주 실적 자랑/포트폴리오 홍보/
일정 조율 잡담("그럼 다음 주 화요일에")/녹취 안내·접속 확인 멘트/맞장구·반복 발화.

남길 가치:
(1) 미팅에서 확정된 사항 — 하기로/안 하기로 정한 것, 범위·금액·일정에 대한 합의
(2) 기술적 제약·실현가능성 지적·대안 구현 제안 (근거를 살려서)
(3) 비용·일정·기술·커뮤니케이션 리스크 신호
(4) 아직 안 정해진 쟁점 — 다음에 확인해야 할 것
(5) 후속조치 — 누가 무엇을 하기로 했는지

【자명성 금지】"요구사항을 명확히 해야 한다", "일정 관리가 중요하다"처럼 어느 프로젝트에나
붙는 일반론은 쓰지 않는다. 이 미팅에서 실제로 오간 말에 근거한 것만 남긴다.

【근거를 자르지 말 것】 무슨 얘기를 했다가 아니라 무슨 내용이었는지를 남긴다.
❌ 나쁜 예: "결제 연동에 대해 논의함"
✅ 좋은 예: "정기결제는 PG사 심사에 2~3주 걸려 오픈 일정에 영향 — 파트너가 1차엔 단건결제만 붙이자고 제안"

【확정 아닌 것을 확정으로 쓰지 말 것】"~하면 좋겠다", "검토해보겠다", "가능할 것 같다"는
decisions가 아니라 open_issues다. decisions에는 양측이 합의한 것만 넣는다.

【후속조치는 주체를 밝힌다】"파트너: ~", "클라이언트: ~", "매니저: ~"로 시작한다.
누가 하기로 했는지 녹취에 없으면 그 항목은 아예 쓰지 않는다.

반드시 아래 JSON 스키마로만 답한다. 한국어로. 해당 내용이 없으면 빈 배열.

스키마:
{
  "decisions": [미팅에서 확정·합의된 사항, 최대 8개],
  "technical_notes": [기술적 제약·실현가능성 지적·대안 제안, 근거 포함 서술형, 최대 8개],
  "risk_signals": [비용·일정·기술·커뮤니케이션 리스크 신호, 최대 6개],
  "open_issues": [아직 안 정해진 쟁점 / 다음에 확인할 것, 최대 6개],
  "follow_ups": ["주체: 할 일" 형식의 후속조치, 최대 6개]
}`;

const MERGE_SYSTEM = `긴 미팅 녹취를 앞에서부터 나눠 추출한 결과 여러 개를 하나로 합친다.
- 같은 내용이 여러 조각에 있으면 더 구체적인(근거가 살아있는) 쪽만 남긴다.
- 없는 내용을 새로 만들지 않는다. 주어진 항목의 표현만 다듬어 합친다.
- 뒤 조각에서 뒤집힌 결정은 뒤 조각을 따른다(미팅이 진행되며 바뀐 것이다).
- 앞 조각에서 open_issues였다가 뒤 조각에서 정해진 것은 decisions로 옮긴다.

입력과 같은 JSON 스키마로만 답한다. 한국어로. 각 배열의 개수 상한도 그대로 지킨다.`;

interface RawExtract {
  decisions?: string[];
  technical_notes?: string[];
  risk_signals?: string[];
  open_issues?: string[];
  follow_ups?: string[];
}

async function callJson(system: string, user: string): Promise<RawExtract> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MEETING_MODEL,
      store: true,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`미팅 추출 요청 실패: ${res.status}`);

  const j = (await res.json()) as { choices?: { message: { content: string } }[] };
  if (!j.choices?.[0]) throw new Error(JSON.stringify(j).slice(0, 300));
  return JSON.parse(j.choices[0].message.content) as RawExtract;
}

/** 줄 경계로만 자른다 — 발화 한 줄이 두 조각에 걸치면 양쪽 다 문맥을 잃는다 */
function chunkTranscript(transcript: string): string[] {
  if (transcript.length <= CHUNK_CHARS) return [transcript];
  const chunks: string[] = [];
  let cur = "";
  for (const line of transcript.split("\n")) {
    if (cur.length + line.length + 1 > CHUNK_CHARS && cur) {
      chunks.push(cur);
      cur = "";
    }
    cur += line + "\n";
  }
  if (cur.trim()) chunks.push(cur);
  return chunks;
}

function toExtract(o: RawExtract, sourceLen: number): MeetingExtract {
  return {
    decisions: o.decisions ?? [],
    technicalNotes: o.technical_notes ?? [],
    riskSignals: o.risk_signals ?? [],
    openIssues: o.open_issues ?? [],
    followUps: o.follow_ups ?? [],
    sourceLen,
  };
}

export interface MeetingInput {
  /** 프로젝트 제목 — 이 미팅이 무슨 건인지 알아야 관련성을 판단한다 */
  projectTitle: string;
  partnerSlug: string | null;
  /** 통화 API가 준 서술형 요약. 짧아서(평균 226자) 프레임 잡는 용도로 같이 넣는다 */
  summary: string | null;
  transcript: string;
}

export async function extractMeeting(m: MeetingInput): Promise<MeetingExtract> {
  const head =
    `프로젝트: ${m.projectTitle}\n` +
    `개발사: ${m.partnerSlug ?? "(미상)"}\n` +
    (m.summary ? `미팅 개요: ${m.summary}\n` : "");

  const chunks = chunkTranscript(m.transcript);

  if (chunks.length === 1) {
    return toExtract(await callJson(SYSTEM, `${head}\n=== 미팅 녹취 ===\n${chunks[0]}`), m.transcript.length);
  }

  // 긴 미팅 — 조각별로 뽑고 합친다. 조각 순서를 알려줘야 "뒤가 앞을 이긴다"를 병합에서 적용할 수 있다.
  const parts: RawExtract[] = [];
  for (let i = 0; i < chunks.length; i++) {
    parts.push(
      await callJson(
        SYSTEM,
        `${head}\n(이 녹취는 긴 미팅을 순서대로 나눈 ${i + 1}/${chunks.length} 조각이다. 이 조각에 실제로 나온 것만 뽑는다.)\n\n=== 미팅 녹취 ===\n${chunks[i]}`,
      ),
    );
  }
  const merged = await callJson(
    MERGE_SYSTEM,
    `${head}\n=== 조각별 추출 결과 (${parts.length}개, 미팅 진행 순서) ===\n` +
      parts.map((p, i) => `[조각 ${i + 1}]\n${JSON.stringify(p, null, 1)}`).join("\n\n"),
  );
  return toExtract(merged, m.transcript.length);
}
