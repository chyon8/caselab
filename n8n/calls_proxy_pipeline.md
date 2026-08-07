# 검수통화 녹취 조회 프록시 (n8n 웹훅)

> `calls_pipeline.md`(구, 대량 by-phone 동기화 → CaseLab `calls` 테이블 적재)와는 **다른 워크플로**다.
> 그건 배치 적재용이고 이건 **매니저 본인이 방금 한 통화를 실시간 조회**하는 용도 —
> **CaseLab DB에 아무것도 저장하지 않는다.** 서로 건드리지 않는다.

**흐름:** 브라우저(`/test`) → 이 웹훅 → 통화 API → 브라우저. **CaseLab 서버(Vercel)는 관여하지 않는다.**

> **왜 프록시인가:** CaseLab은 https, 통화 API는 `http://192.168.10.217` → 브라우저가 mixed content로
> 차단한다("회사에서만 쓴다"로 안 풀리는 별개 문제). 게다가 `X-API-Key`를 브라우저에 두면 노출된다.
> n8n이 중간에서 키를 붙여 대신 호출하고 결과만 돌려준다.
>
> **회사(사내) 네트워크에서만 동작** — 통화 API가 내부 IP라서. 사용자 승인 완료.

**본진(MariaDB) SQL은 필요 없다.** projects·qna·구 calls 워크플로는 본진에서 무언가를 먼저 조회해야 해서
`.sql` 파일이 딸려 있지만, 이 워크플로는 본진을 **아예 안 거친다** — `member_name`으로 통화 API를 직접
치는 설계라 "본진에서 고객 번호를 뽑는 hop"이 통째로 사라졌기 때문이다(NEXT_STEPS 기획 결정).

API 명세는 **DATA_SCHEMA.md §8-3**. 이 문서는 그 API를 브라우저가 부를 수 있게 감싸는 방법만 다룬다.

---

## 노드 4개

```
① Webhook (GET)          ← 브라우저가 ?member_name=…&phone=…&limit=50 로 호출
② HTTP Request (GET)     → 통화 API. channel=phone 고정
③ Code                   → 고객 전화번호·상담원명 제거 (PII 는 여기서 끊는다)
④ Respond to Webhook     → CORS 헤더 붙여 응답
```

### 구 calls 워크플로와 뭐가 같고 뭐가 다른가

가운데 두 노드(②③)는 **구 `calls_pipeline.md`와 사실상 같다** — 같은 API를 치고 같은 방식으로 PII를
자른다. 다른 건 **양끝**뿐이다:

| | 구 배치 (`calls_pipeline.md`) | 이 프록시 |
|---|---|---|
| 맨 앞 | HTTP POST 본진 `/query` + `calls_phones.sql` → 번호 목록 | **Webhook** (브라우저가 이름을 들고 옴) |
| 맨 뒤 | HTTP POST → CaseLab `/api/sync/calls` (DB 적재) | **Respond to Webhook** (브라우저에 반환) |
| 트리거 | 수동 실행 버튼 | 사람이 버튼 누를 때마다 |
| 결과 | `calls` 테이블에 저장 | **아무 데도 저장 안 함** |

**`Respond to Webhook`이 새로 필요한 이유:** 구 워크플로는 데이터를 CaseLab으로 **밀어넣고 끝**이라
아무도 응답을 기다리지 않았다(fire-and-forget). 이건 **브라우저가 답을 기다리고 있다** — n8n에서
호출자에게 데이터를 돌려주는 방법은 이 노드뿐이다. 본진 조회 노드가 사라진 자리를 이게 메운다고
보면 된다(노드 수는 4개로 같다).

**기존 워크플로가 캔버스에 있다면 복제해서 고치는 게 빠르다:** 복제 → 맨 앞 노드를 Webhook으로 교체 →
②의 쿼리 파라미터만 아래처럼 바꾸고 → ③의 마지막 배치 묶는 부분만 손보고 → 맨 뒤 노드를
Respond to Webhook으로 교체. **원본은 그대로 둔다**(`calls` 테이블 배치 적재라는 제 역할이 따로 있다).

---

### ① Webhook

| 항목 | 값 |
|---|---|
| HTTP Method | **`GET`** |
| Path | `caselab-calls-lookup` |
| Authentication | None |
| Respond | **`Using 'Respond to Webhook' Node`** |

> **왜 GET인가 (POST 아님):** 브라우저가 다른 출처로 `POST + application/json`을 보내면 **CORS 프리플라이트
> (OPTIONS)** 를 먼저 쏜다. n8n Webhook 노드는 지정한 메서드만 받으므로 OPTIONS가 404로 떨어지고
> **조회 자체가 실패한다.** 쿼리스트링 GET은 "단순 요청"이라 프리플라이트가 아예 없다 —
> 세팅에서 제일 흔히 깨지는 지점을 회피한 것. 브라우저 코드도 GET으로 맞춰져 있다.

들어온 쿼리 파라미터는 `{{ $json.query.member_name }}` 처럼 읽는다.

---

### ② HTTP Request

| 항목 | 값 |
|---|---|
| Method | `GET` |
| URL | `http://192.168.10.217:8000/api/calls/by-phone/` |
| Send Headers | **일단 OFF** — 401이 나올 때만 ON → `X-API-Key` = `<키>` |
| Send Query Parameters | ON → **Specify: `Using JSON`** |

> **헤더는 먼저 빼고 시도한다.** 구 워크플로(`calls_pipeline.md` ②)엔 헤더가 없었는데, 그건 당시 명세가
> "인증 없음"이었기 때문이다. 2026-08-06 정정된 명세(DATA_SCHEMA §8-3)는 `X-API-Key`가
> **서버에 `KAKAO_API_KEY`가 설정된 경우에만 필수**라고 한다 — 즉 지금 그 서버에 키가 걸려 있는지에
> 따라 갈린다. 확인할 방법은 한 번 쳐보는 것뿐이니, **헤더 없이 실행해서 401이 나오면 그때 추가**한다.

Query Parameters JSON (표 방식 말고 **JSON 방식**). 필드를 **Expression 모드**로 바꾼 뒤 이걸 넣는다:

```
{{ JSON.stringify(Object.assign({ channel: 'phone' }, $json.query)) }}
```

> ⚠️ **`=`를 같이 붙여넣지 말 것 — `JSON parameter needs to be valid JSON` 에러의 원인.**
> 문서·설정 파일에서 보이는 앞의 `=`는 "이 필드는 표현식"이라는 n8n **내부 표기**다. UI에서 필드를
> Expression 모드로 전환하면 `=`는 이미 붙은 것이고, 편집기에는 `{{ … }}`부터 넣어야 한다.
> `={{ … }}`를 그대로 넣으면 결과가 `={"channel":"phone"}`이 되어 JSON 파싱이 깨진다.
> 필드가 **Fixed 모드**면 표현식이 아예 평가되지 않고 글자 그대로 들어가 같은 에러가 난다.
>
> **확인법:** 표현식 편집기 아래 **Result 미리보기**에 `{"channel":"phone","member_name":"장수룡","limit":"50"}`
> 같은 값이 떠야 한다. `[object Object]`거나 `=`로 시작하면 위 둘 중 하나가 잘못된 것.
>
> 스프레드(`...`) 대신 `Object.assign`을 쓰는 이유는 n8n 표현식 파서가 버전에 따라 객체 스프레드에서
> 걸리는 경우가 있어서다. 결과는 같다.

> **왜 표가 아니라 JSON인가 — 이게 없으면 이름 조회가 깨진다.** 표 방식으로 `phone` 칸에
> `={{ $json.query.phone }}`를 넣으면, 번호 없이 이름만 조회할 때 **`phone=`(빈 값)이 그대로 전송**된다.
> 명세상 `phone`은 **8자리 미만이면 400** 이라, 정작 주 사용 경로인 "이름으로 내 통화 찾기"가
> 에러로 떨어질 수 있다. 브라우저는 값이 있는 파라미터만 실어 보내므로(`fetchCalls`), `$json.query`를
> **그대로 펼치면 빈 파라미터가 아예 안 생긴다.**
>
> `channel: 'phone'`은 여기서 **고정** — 카카오는 서버가 걸러준다(사용자 결정). 브라우저가 바꿀 수 없다.
>
> ⚠️ **`confidence`로 거르지 말 것.** 구 배치 파이프라인은 `confidence=low`를 버렸지만, 그건 번호로
> 남의 통화까지 긁어오던 상황의 이야기다. 검수 단계 프로젝트는 애초에 매핑 신뢰도가 낮게 잡히므로
> 여기서 low를 버리면 **정작 찾으려는 통화가 사라진다.** 매니저가 눈으로 고르는 방식이라 불필요.

---

### ③ Code

Mode: **`Run Once for All Items`**. 고객 전화번호·상담원명을 **여기서 끊는다** — 브라우저에 도달하는
순간 이미 PII 노출이라 뒤로 미룰 수 없다(기존 파이프라인과 같은 원칙).

```js
const rows = $input.all()
  .flatMap((item) => item.json.results || [])
  .map((c) => ({
    id: c.id,
    project_id: c.project_id,
    project_title: c.project_title,
    call_type: c.call_type,
    call_time_secs: c.call_time_secs,
    summary: c.summary,
    transcript: c.transcript,
    drive_url: c.drive_url,
    created_at: c.created_at,
    // phone·member_name 은 의도적으로 제외 — PII 는 여기서 끊는다
  }));
return [{ json: { results: rows } }];
```

빈 껍데기 제외·최신순 정렬·녹취 속 연락처 제거(`scrubPii`)는 **브라우저가 한다** — n8n은 나르기만
한다는 기존 역할 분담 그대로.

> **구 워크플로와 한 가지 다름: `project_title`을 남긴다.** 구 배치는 이것도 뺐는데, CaseLab DB에
> 프로젝트명이 이미 있어 중복이었기 때문이다. 여기선 **목록에서 어느 통화인지 구분하는 유일한 단서**라
> 필요하다. 프로젝트명은 고객 개인정보가 아니고, 어차피 화면에만 뜨고 저장되지 않는다.
> **고객 개인정보인 `phone`·`member_name`은 구 워크플로와 똑같이 뺀다.**

---

### ④ Respond to Webhook

| 항목 | 값 |
|---|---|
| Respond With | **`First Incoming Item`** |
| Options → Response Headers → Entry | `Access-Control-Allow-Origin` |

값은 **호출한 출처를 그대로 되돌려주는** 식이 편하다 — 로컬(`localhost:3000`)과 배포 도메인을
오갈 때 값을 안 바꿔도 된다:

```
={{ $('Webhook').item.json.headers.origin }}
```

고정하고 싶으면 `https://<CaseLab 배포 도메인>`을 그대로 적어도 된다(로컬 테스트 땐 값을 바꿔야 함).

> **이 헤더가 없으면 브라우저가 응답을 읽지 못하고 조회가 실패한다.** 홈 "지금 동기화" 웹훅은
> 트리거만 하고 응답을 안 읽어서(`no-cors`) 필요 없었지만, 이건 **목록을 읽어 화면에 그려야** 한다.

---

## 응답 형태 (브라우저가 기대하는 것)

```json
{ "results": [
  {
    "id": 6203,
    "project_id": 154234,
    "project_title": "프로젝트 제목",
    "call_type": "in",
    "call_time_secs": 120,
    "summary": "통화 요약",
    "transcript": "전체 녹취록 텍스트",
    "drive_url": "https://drive.google.com/...",
    "created_at": "2026-04-07 13:55:33"
  }
]}
```

CaseLab 쪽 타입은 [`src/lib/calls.ts`](../src/lib/calls.ts)의 `CallRecord`. 필드명이 다르면 ③에서 맞춘다.

---

## 세팅 후 확인

1. 워크플로 **Active** 토글 ON (Production URL이어야 함 — `/webhook/…`, `/webhook-test/…` 아님)
2. Production URL을 `.env.local`(로컬)·Vercel 환경변수에 **`N8N_CALLS_WEBHOOK_URL`** 로 등록
   (Vercel은 저장 후 **재배포**해야 반영)
3. `/test` → Mock 모드 **해제** → "내 통화 불러오기"

증상별 원인:

| 증상 | 볼 곳 |
|---|---|
| "CORS 헤더가 있는지 확인" 에러 | ④ 헤더 누락(값에 `=` 붙여넣은 경우 포함), 또는 ①의 Respond 설정이 `Using 'Respond to Webhook' Node`가 아니라 응답이 ④를 안 거침 |
| `404` | Path 오타 / Active OFF / test URL 사용 |
| `JSON parameter needs to be valid JSON` | ② 쿼리 JSON 필드에 `=`를 같이 넣었거나 Fixed 모드 → Expression 모드 + `{{ 부터` |
| `400` | ②를 표 방식으로 넣어 빈 `phone`이 전송됨 → JSON 방식으로 교체 |
| `401` | `X-API-Key` 불일치 |
| **에러 없이 0건** | `member_name` 불일치 (정확 일치라 틀리면 빈 목록) — 아래 실측 참조 |

---

## 실측 기록 (첫 조회 후 채울 것)

- [x] **`member_name` 포맷 — 실명이 맞다** (2026-08-07 실측). 구글 로그인 세션의 표시 이름("장수룡")을 그대로 넘기면 조회된다 → `managers.ts` 역매핑 불필요, 입력칸 자동 채움이 그대로 유효.
- [x] **이름·번호는 AND로 걸린다** (2026-08-07 실측). 둘 다 보내면 "그 번호와의 통화 중 내가 한 것"만 나온다 — 남이 한 통화를 번호로 찾으려면 이름을 안 보내야 한다. UI는 이 때문에 **택일 토글**(이름으로 / 번호로)로 만들었고, 고른 쪽 값만 전송한다.
- [ ] **반영 지연** — 통화 종료 후 몇 분 뒤에 API에 뜨는지. 즉시면 통화 직후 그 자리에서 draft까지, 오래 걸리면 나중에 다시 들어와야 한다는 안내가 UI에 필요.
