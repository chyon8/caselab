// 개발사 Q&A 스레드 → 검수용 핵심 요약(QnaSummary). gpt-4o-mini, JSON 스키마 강제.
// ⚠️ scripts/extract-qna.mjs에 백필용 병렬 사본이 있다 — 프롬프트를 고치면 양쪽을 맞춰야 한다.

import type { QnaSummary } from "@/data/types";

export const QNA_MODEL = "gpt-4o-mini";

const SYSTEM = `너는 위시켓 프로젝트 "검수 매니저"를 돕는 어시스턴트다.
프로젝트 공고에 달린 개발사(파트너) 댓글/Q&A 스레드를 받아, 검수 매니저가 이 프로젝트를 검토할 때 알아야 할 것만 남긴다.
반드시 버릴 노이즈: 세일즈/자기소개/지원 인사("지원했습니다")/등급 자랑("상위 0.1% 프라임 파트너")/목업·포트폴리오 링크 홍보/일반적 다짐.
남길 가치: (1) 프로젝트 범위·요구사항을 명확히 하는 질문, (2) 기술적 제약·실현가능성 지적·대안 구현 제안,
(3) 숨은 비용·일정·기술 리스크, (4) 클라이언트가 답변으로 확정한 사항.
중요: 모호하거나 일반적인 질문(예: "요구사항이 무엇인가요?", "레퍼런스가 무엇인가요?", "미팅에서 논의할 내용은?")은 버리고, 구체적이고 이 프로젝트 고유한 질문만 남긴다.

【혼합 텍스트 주의 — 절대 통째로 버리지 말 것】 세일즈 문구·자기소개·지원 인사로 시작하거나 그런 내용이 섞인
긴 댓글이라도, 그 안에 프로젝트 범위를 좁히는 구체적 질문이나 요구사항 갭 지적("~에 대한 처리 방식이 없습니다",
"~기준이 필요합니다" 등)이 있으면 그 부분만 반드시 골라내 남긴다. 댓글 전체가 세일즈처럼 시작한다고
전체를 노이즈로 판단해 버리지 않는다 — 노이즈 판정은 문장 단위이지 댓글 단위가 아니다.

【technical_notes — 특히 신경 쓸 것】
개발사가 근거를 대며 짚은 기술 내용은 검수에서 가장 값지다. 질문으로 바꾸지 말고 근거를 살려 서술형으로 남겨라.
- 기술적 제약/실현 불가능성: "요구한 30~60초 영상은 현존 API로는 고정 아바타 모델 외에 불가, 대부분 10초 내외"
- 대안 구현 방안 제안: "1단계 GPT-4o로 대본 생성 → 2단계 CLOVA/Polly TTS + MoviePy 합성으로 단계적 접근 제안"
- 비용을 좌우하는 기술 선택: "ComfyUI는 이미지 생성이 무료라 API 대비 비용 절감"
❌ 나쁜 예(근거가 잘림): "영상을 이어붙이는 형태인지?"
✅ 좋은 예(근거가 살아있음): "30~60초 영상은 API 직접 생성 불가 — 짧은 클립 이어붙이기가 유일한 방법이나 토큰 소모가 큼"

반드시 아래 JSON 스키마로만 답한다. 한국어로.

스키마:
{
  "key_questions": [검수 시 짚어야 할 구체적 핵심 질문/쟁점, 최대 6개, 없으면 []],
  "decisions": [클라이언트가 답변으로 확정한 사항, 없으면 []],
  "risk_signals": [비용·일정·기술 리스크 신호, 없으면 []],
  "technical_notes": [기술적 제약·실현가능성 지적·대안 구현 제안, 근거 포함 서술형, 최대 6개, 없으면 []],
  "keywords": [핵심 키워드/기술/도메인, 최대 8개],
  "noise_dropped": 버린 노이즈 댓글 수(정수 추정)
}`;

export interface QnaThread {
  title: string | null;
  body: string | null;
  by: string | null;
}

interface RawSummary {
  key_questions?: string[];
  decisions?: string[];
  risk_signals?: string[];
  technical_notes?: string[];
  keywords?: string[];
  noise_dropped?: number;
}

export async function extractQnaSummary(title: string, threads: QnaThread[]): Promise<QnaSummary> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const body = threads
    .map(
      (t, i) =>
        `[댓글 ${i + 1}${t.by ? ` by ${t.by}` : ""}]\nQ: ${t.title ?? ""}\nA: ${t.body ?? "(답변없음)"}`,
    )
    .join("\n\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: QNA_MODEL,
      store: true,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `프로젝트 제목: ${title}\n\n=== 댓글/Q&A 스레드 (${threads.length}개) ===\n${body}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Q&A 요약 요청 실패: ${res.status}`);

  const j = (await res.json()) as { choices?: { message: { content: string } }[] };
  if (!j.choices?.[0]) throw new Error(JSON.stringify(j).slice(0, 300));
  const o = JSON.parse(j.choices[0].message.content) as RawSummary;

  return {
    keyQuestions: o.key_questions ?? [],
    decisions: o.decisions ?? [],
    riskSignals: o.risk_signals ?? [],
    technicalNotes: o.technical_notes ?? [],
    keywords: o.keywords ?? [],
    noiseDropped: o.noise_dropped ?? 0,
    sourceCount: threads.length,
  };
}
