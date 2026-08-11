// qna_summary.riskSignals(자유 문장) → 고정 택소노미 태그 → ai_insights.risk_tags
// ⚠️ scripts/tag-risks.mjs에 백필용 사본이 있다 — 택소노미/프롬프트를 고치면 양쪽을 맞춰야 한다.
//
// 왜 LLM인가: 리스크 문장 2,315개가 전부 서로 다른 자유 문장이라 "같은 문장 세기"로는 랭킹이 안 나온다.
// 키워드 규칙도 대봤지만(실측 매칭률 77%), "…해서 일정에 영향을 줄 수 있음" 같은 **결과절**을 원인으로
// 오분류해 일정·비용 태그가 과대 계상된다. 무엇이 원인인지는 문장을 읽어야 알 수 있다.

export const RISK_MODEL = "gpt-4o-mini";

/**
 * 고정 15종. 이 목록 밖의 값은 버린다 —
 * 태그가 매번 새로 생기면 "가장 자주 반복되는 리스크" 랭킹 자체가 성립하지 않는다.
 */
export const RISK_TAGS = [
  "외부 연동",
  "결제·정산",
  "데이터 정합성",
  "요구사항 불명확",
  "일정 압박",
  "비용 초과",
  "기술 실현 불확실",
  "성능·트래픽",
  "보안·개인정보",
  "규제·심사",
  "레거시·이관",
  "AI 정확도",
  "하드웨어·기기",
  "자료 미비",
  "운영·의사결정",
] as const;

const SYSTEM = `너는 위시켓 프로젝트 "검수 매니저"를 돕는 분류기다.
개발사(파트너)가 공고 Q&A에서 지적한 **리스크 문장들**을 받아, 아래 고정 태그로만 분류한다.

태그 정의:
- 외부 연동: 서드파티 API·SDK·외부 시스템 연동의 가능 여부, 스펙 불확실, 권한 발급
- 결제·정산: 결제·환불·정산·수수료 흐름과 그 경계 케이스, 금전 분쟁
- 데이터 정합성: 동기화 누락·지연, 중복·이중 집계, 값 불일치, 데이터 유실
- 요구사항 불명확: 범위·기준·산출물이 정해지지 않아 판단이 미뤄진 상태
- 일정 압박: 요구 기간이 촉박하거나 일정 산정 근거가 없음
- 비용 초과: API 사용료·인프라·데이터 구축 등 견적 밖 비용이 발생할 위험
- 기술 실현 불확실: 요구 기능이 기술적으로 되는지 자체가 검증되지 않음
- 성능·트래픽: 처리량·응답속도·동시접속·부하
- 보안·개인정보: 권한 분리, 민감정보 노출·유출
- 규제·심사: 스토어 심사, 법·규제, 저작권·라이선스, 인증 획득
- 레거시·이관: 기존 시스템·데이터 이관, 소스 미제공, 리뉴얼 시 기존 구조 영향
- AI 정확도: 모델·인식 정확도가 보장되지 않음
- 하드웨어·기기: 디바이스·센서·네트워크 등 물리 환경 의존
- 자료 미비: 클라이언트가 줘야 할 자료·콘텐츠·기획 산출물이 없음
- 운영·의사결정: 담당자 부재·협의 지연, 출시 후 운영·유지보수 주체 미정

【가장 중요】 **결과가 아니라 원인**에 태그를 단다. 결과절("~해서 일정이 늘 수 있음",
"~때문에 비용이 커질 수 있음")에는 태그를 달지 않는다. 원인 쪽 태그 하나로 끝낸다.
- "샘플 데이터 형태에 따라 아키텍처가 달라져 일정 수립에 영향을 줄 수 있음"
  → {"tags": ["요구사항 불명확"]}  ("일정 압박"을 같이 달면 틀린 것이다 — 일정은 결과다)
- "이미지 5만 장 처리 비용이 몇백만원에 이를 수 있음" → {"tags": ["비용 초과"]}
"일정 압박"은 요구 기간 자체가 촉박하다고 말할 때만, "비용 초과"는 실제로 돈이 더 드는
항목을 짚을 때만 단다.

문장 하나에 태그가 여러 개일 수 있고, 태그 하나에 문장이 여럿일 수도 있다.
목록 전체에서 **실제로 지적된 것만** 고른다 — 억지로 채우지 않는다. 해당 없으면 빈 배열.

반드시 아래 JSON으로만 답한다.
{"tags": ["태그명", ...]}`;

interface RawTags {
  tags?: unknown;
}

/** 리스크 문장 목록 → 택소노미 태그(중복 제거, 목록 밖 값 제거) */
export async function tagRiskSignals(title: string, signals: string[]): Promise<string[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: RISK_MODEL,
      store: true,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `프로젝트 제목: ${title}\n\n=== 리스크 문장 (${signals.length}개) ===\n${signals
            .map((s, i) => `${i + 1}. ${s}`)
            .join("\n")}`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`리스크 태깅 요청 실패: ${res.status}`);

  const j = (await res.json()) as { choices?: { message: { content: string } }[] };
  if (!j.choices?.[0]) throw new Error(JSON.stringify(j).slice(0, 300));
  const o = JSON.parse(j.choices[0].message.content) as RawTags;
  const raw = Array.isArray(o.tags) ? o.tags : [];

  const allowed = new Set<string>(RISK_TAGS);
  return [...new Set(raw.filter((t): t is string => typeof t === "string" && allowed.has(t)))];
}
