// 공고문 붙여넣기 검색(L2) — 정리되지 않은 원본 의뢰 내용을 코퍼스와 같은 표준 공고 형식으로
// 정규화한다. 저장된 임베딩(projects.embedding)은 정제된 공고 원문으로 만들어졌으므로, 검색
// 입력도 같은 형식으로 맞춰야 유사도가 정확하다.
//
// 2단계: ① gpt-4o-mini(temp 0)로 노이즈([예시] 힌트·안 고른 선택옵션·미결정 응답 등)를 걷어내며
//        표준 섹션으로 재구성 → ② cleanPosting()이 모델이 놓친 "미제공" 류 부재 문구와 빈 헤더를
//        결정적으로 제거(모델 컨디션에 안 흔들리도록). 결과는 임베딩 입력으로만 쓰인다(저장 안 함).

const PROMPT = `너는 위시켓 검수매니저를 돕는 어시스턴트다.
개발 외주 프로젝트의 "정리되지 않은 원본 의뢰 내용"을 받아,
검수 완료된 표준 공고문 형식으로 재구성한다.

# 절대 규칙
1. 원문에 실제로 있는 내용만 쓴다. 없는 정보를 추측·창작하지 않는다.
   (이 결과는 유사사례 검색에 쓰인다. 지어낸 내용은 잘못된 매칭을 만든다.)
2. 정보가 없는 섹션은 헤더 자체를 출력하지 않는다. 그 섹션은 아예 없는 것처럼 완전히 생략한다.
   "명시되지 않음", "미제공", "없음", "원문에 없음", "미확인", "정보 없음" 등
   부재를 나타내는 문구를 어떤 경우에도 쓰지 마라.
3. 노이즈는 버린다:
   - "[예시] …" 로 시작하는 템플릿 힌트
   - "선택 옵션: ['…','…']" 로 나열된 보기 목록. 사용자가 자기 말로 서술한 답이 있으면
     그 서술만 쓰고, 선택 옵션 목록의 문구는 (고른 것 포함) 기능·요구로 옮기지 마라.
   - "아직 결정하지 않음", "잘 모르겠어요" 등 미결정 응답
   - 보안·테스트 방식·소통 방식·권한 등 프로젝트 성격이 아니라 진행 방식에 대한
     일반 문답 답변 (프로젝트 핵심 요구가 아니면 생략)
   - 문서 서식·UI 조작 설명 (버튼 이름, 파일 경로, 화면 캡처 묘사 등)
   - 반복되는 질문 라벨과 번호
4. 고유명사·기술스택·수치·핵심 동작 로직은 원문 그대로 보존한다
   (예: 증권사 API, DMX512, Unity, 카카오 알림톡, +1% 익절/-3% 물타기, 특정 시간대 규칙 등).
   프로그램의 핵심 동작 방식/로직은 [과업 범위]의 상세 기능에 넣는다(배경이 아니라).
5. 요약이 아니라 재구성이다. 형식만 정리하고 핵심 요구는 빠뜨리지 않는다.
6. 출력은 한국어 마크다운. 아래 섹션 헤더와 그 내용만 출력한다.
   형식 설명이나 괄호 안내 문구를 출력에 복사하지 마라. 그 외 어떤 말도 하지 않는다.

# 사용 가능한 섹션 (정보가 있는 것만, 이 순서로)
[프로젝트 개요]           ← 무엇을 만드는지, 대상 사용자/규모
[프로젝트 배경 및 목표]    ← 왜, 현재 운영 방식과 불편, 기대 효과
[과업 범위]               ← 하위에 "1. 수행 범위"(웹/앱/PC·신규/고도화·플랫폼),
                            "2. 상세 기능 요구 사항"(모듈별 "2-1." "2-2." 로),
                            "3. 관리자 기능"
[기술 스택 / 외부 연동]    ← 사용 기술·인프라·연동 서비스 (또는 "제안 요청")
[비기능 요구사항]          ← 성능·보안·안정성
[주요 일정]               ← 착수/납품
[예산]                    ← 금액 또는 "견적 후 협의"
[지원 자격 및 우대 사항]
[산출물]

# 희소 입력 처리 예시
원문이 "간단한 쇼핑몰 앱 만들고 싶어요." 뿐이라면, 출력은 정확히 아래 두 줄이다(다른 섹션 없음):
[프로젝트 개요]
- 쇼핑몰 앱 개발`;

// ── 결정적 후처리: 부재 문구 불릿 제거 + 빈 헤더 접기 ──────────────────────
// FILLER_END: 순수 필러 토큰으로 끝나는 불릿(문장형 포함) — 진짜 신호와 겹치지 않는 말들
const FILLER_END = /(미제공|명시되지\s*않음|원문에\s*없음|정보\s*없음|미확인|미상|알\s*수\s*없음)[.\s]*$/;
// FILLER_ONLY: '없음'·'미정'은 진짜 신호일 수 있어("외부 연동 없음" 등) 불릿 전체가 그 말일 때만 제거
const FILLER_ONLY = /^[-\s]*(없음|미정|해당\s*없음)[.\s]*$/;

/** 헤더 레벨: [..]=0, "N-N."=2, "N."=1, 그 외 null(본문) */
function level(line: string): number | null {
  const t = line.trim();
  if (/^\[.*\]$/.test(t)) return 0;
  if (/^\d+-\d+\.\s/.test(t)) return 2;
  if (/^\d+\.\s/.test(t)) return 1;
  return null;
}

function isAbsence(line: string): boolean {
  const t = line.trim();
  if (level(t) !== null) return false; // 헤더는 제외
  return FILLER_END.test(t) || FILLER_ONLY.test(t);
}

/** 모델 출력에서 부재 문구 불릿을 지우고, 내용이 사라져 빈 껍데기가 된 헤더를 접는다. */
export function cleanPosting(md: string): string {
  let lines = md.split("\n").filter((l) => !isAbsence(l));
  let changed = true;
  while (changed) {
    changed = false;
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const lvl = level(lines[i]);
      if (lvl !== null) {
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === "") j++;
        const nextLvl = j < lines.length ? level(lines[j]) : null;
        // 다음 실질 줄이 같은/상위 레벨 헤더거나 끝이면 이 헤더는 빈 껍데기 → 제거
        const empty = j >= lines.length || (nextLvl !== null && nextLvl <= lvl);
        if (empty) {
          changed = true;
          continue;
        }
      }
      out.push(lines[i]);
    }
    lines = out;
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

interface ChatResponse {
  choices?: { message?: { content?: string } }[];
}

/** 원본 의뢰 내용을 표준 공고 형식의 정규화 텍스트로 변환한다(임베딩 입력용). */
export async function normalizePosting(raw: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY가 설정되지 않았습니다.");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      store: true,
      temperature: 0,
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: `원문:\n"""\n${raw.slice(0, 12000)}\n"""` },
      ],
    }),
  });
  if (!res.ok) throw new Error(`정규화 요청 실패: ${res.status}`);

  const j = (await res.json()) as ChatResponse;
  const out = j.choices?.[0]?.message?.content;
  if (!out) throw new Error("공고로 정리할 내용이 없습니다. 공고 본문을 붙여넣어 주세요.");
  return cleanPosting(out);
}
