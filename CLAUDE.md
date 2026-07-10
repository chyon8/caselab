# CLAUDE.md — CaseLab 개발 가이드라인

> Behavioral guidelines to reduce common LLM coding mistakes.
>
> **Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

---

## 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

---

## 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

---

## 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

**The test:** Every changed line should trace directly to the user's request.

---

## 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## 5. 프로젝트 규칙

### 5-1. 문서 참조 (Source of Truth)

제품 방향과 도메인 지식은 아래 문서가 기준이다. 서로 충돌하면 최신 문서가 우선.

| 문서 | 내용 |
|---|---|
| [`design.md`](./design.md) | 디자인 시스템 (토큰, 타이포, 컴포넌트 스펙) — **유일한 디자인 기준** |
| [`SCORING_SPEC.md`](./SCORING_SPEC.md) | Completion 점수 산정 기준 (12개 섹션, 가중치, 공고 매핑) |
| [`DATA_SCHEMA.md`](./DATA_SCHEMA.md) | 본진(위시켓) DB 스키마 & 연동 레퍼런스 |
| [`ROADMAP.md`](./ROADMAP.md) | 비전, 완료 사항, 향후 개발 방향 |
| [`CASELAB_DECISIONS.md`](./CASELAB_DECISIONS.md) | 확정된 의사결정 기록 |
| `CaseLab_v2.0.html` | UI 프로토타입 — 디자인/레이아웃 참고용 (하드코딩, 코드는 재사용하지 않음) |

> 구버전 PRD의 Project Model 스키마, 모드 A/B, Owner/Member/Viewer 역할 체계는 **폐기됨**. 참조하지 않는다.

### 5-2. 기술 스택

- **프레임워크:** Next.js (App Router) + TypeScript (strict mode)
- **스타일링:** Vanilla CSS + CSS Custom Properties (design.md 토큰 기반), CSS Modules
- **데이터:** 어댑터 패턴 — `DataSource` 인터페이스 → Mock 어댑터 우선, 실주소(n8n 웹훅 등) 확정 시 교체
- **배포:** Vercel
- **상태관리:** React 내장 상태만 (외부 상태관리 라이브러리 없음)

### 5-3. 코드 컨벤션

- **네이밍:** 컴포넌트는 PascalCase, 유틸/훅은 camelCase, CSS 클래스는 kebab-case
- **파일 구조:** feature-based (기능별 폴더 분리)
- **커밋 메시지:** conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `style:`, `chore:`)

### 5-4. 금지 사항

- ❌ TailwindCSS 사용 금지 (명시적 요청 없는 한)
- ❌ 불필요한 third-party 라이브러리 추가 금지 (추가 전 반드시 확인)
- ❌ `any` 타입 사용 금지
- ❌ 인라인 스타일 사용 금지 (CSS Custom Properties 사용)
- ❌ 하드코딩된 색상값 사용 금지 (design.md 토큰 참조만 허용)
- ❌ 본진(위시켓) DB에 쓰기(Write) 금지 — CaseLab은 read-only 분석 서비스

---

## 6. Git 워크플로우 (필수 준수)

> **절대 규칙:** AI는 터미널에서 git 명령어를 직접 실행하지 않는다.
> 사용자가 복사-붙여넣기 할 수 있는 명령어만 제공한다.

### 파일 변경 시 프로세스

코드 변경이 발생하면 반드시 아래 순서를 따른다:

#### Step 1: 변경 리포트

변경된 파일 목록과 각 파일의 변경 내용을 설명한다.

```
📁 변경된 파일:
- src/Workspace.tsx — [무엇을 왜 변경했는지]
- src/Workspace.css — [무엇을 왜 변경했는지]

📝 변경 요약:
[전체적으로 어떤 기능이 바뀌었는지 한 줄 설명]
```

#### Step 2: 검토 체크리스트

사용자가 변경 사항을 확인할 수 있는 구체적인 체크리스트를 제공한다.

```
✅ 검토 체크리스트:
- [ ] 브라우저에서 [특정 화면]을 열어 [특정 동작] 확인
- [ ] [특정 입력]을 해보면 [기대 결과]가 나와야 함
- [ ] [특정 상태]에서 [특정 UI]가 올바르게 표시되는지 확인
```

#### Step 3: 사용자 컨펌 대기

사용자가 "확인" 또는 "컨펌"이라고 할 때까지 대기한다.

#### Step 4: Git 명령어 제공

사용자가 컨펌하면, 복사-붙여넣기용 git 명령어를 제공한다.

````
```bash
git add -A
git commit -m "feat: [변경 내용 요약]"
git push origin main
```
````

### 커밋 메시지 규칙

- `feat:` 새 기능
- `fix:` 버그 수정
- `refactor:` 리팩토링 (기능 변경 없음)
- `style:` 스타일/UI 변경
- `docs:` 문서 변경
- `chore:` 설정, 의존성 등

### 금지 사항

- ❌ AI가 `git add`, `git commit`, `git push` 등을 터미널에서 직접 실행하는 것
- ❌ 사용자 컨펌 없이 커밋 명령어를 제공하는 것
- ❌ 변경 리포트 없이 바로 커밋을 제안하는 것
