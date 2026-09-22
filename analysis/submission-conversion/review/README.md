# 원문 분류 작업 폴더

집과 회사에서 같은 파일로 원문 분류를 이어가기 위한 Git 공유 폴더다.

- 프로젝트 ID와 모집 결과는 사람/AI 판독 화면에서 제외했다.
- 주민번호·이메일·전화번호·URL과 명시적으로 표시된 담당자 이름은 생성 시 제거한다.
- `analysis-targets.json`에는 익명 표본 ID, 제출 월, 14일 모집 여부만 있다.
- 원본 7·8월 거절 CSV와 프로젝트 ID 매핑은 `.private/`에만 남긴다.

두 사람이 `validation-reviewer-a.tsv`, `validation-reviewer-b.tsv`를 각각 작성한 뒤 실행한다.

```bash
node scripts/evaluate-submission-text.mjs validation
```

검증 기준을 통과한 항목만 확정한 뒤 나머지 분류를 실행한다.

```bash
node scripts/classify-submission-text.mjs classify full
```
