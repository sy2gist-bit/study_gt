---
name: study-guide-content
description: Turn source material — a research paper PDF, textbook pages, scanned handouts, lecture notes — into this repo's study-guide content JSON, plus a subject adapter and a manifest entry, so it renders in the five-tab study app. Use this whenever the user points at study material and wants to learn, memorize, review, or present it: "이 논문으로 스터디 가이드 만들어줘", "이 PDF 암기 카드로 만들어줘", "발표 준비해야 해", "시험 범위 정리해줘", or when they drop a paper/PDF into this repo. Also use it to extend or fix content that already exists in content/ (adding cards, filling sourceSpan, rewriting a module). Prefer this over writing the JSON freehand — the schema has cross-references between cards, modules and adapters that break the app silently when they drift.
---

# 스터디 가이드 콘텐츠 만들기

자료(논문 PDF·교과서·스캔본·필기)를 이 저장소의 학습 콘텐츠로 바꾼다. 결과물은 세 가지다.

| 산출물 | 경로 | 비고 |
|---|---|---|
| 콘텐츠 | `content/<id>.json` | 본체 |
| 어댑터 | `adapters/<과목id>.json` | 맞는 게 이미 있으면 재사용 |
| 목록 한 줄 | `content/manifest.json` | 빠뜨리면 선택 화면에 안 뜬다 |

`renderer/` 는 **절대 건드리지 않는다.** 렌더러는 과목을 모르도록 설계돼 있고, 새 과목이
JSON 추가만으로 늘어나는 게 이 저장소의 핵심 전제다. 렌더러를 고쳐야 할 것 같다면
대개 콘텐츠를 스키마에 맞추지 않은 것이다.

## 이 앱 안의 "새 자료로 만들기"와 무엇이 다른가

앱에도 같은 일을 하는 브라우저 내장 파이프라인이 있다(`renderer/ingest.js`). 그쪽은
링크를 받은 **다른 사람**이 자기 API 키로 돌리는 용도다. 이 스킬로 할 때의 이점은
하나로 요약된다 — **원문을 다시 읽을 수 있다.**

앱은 한 번 추출한 텍스트만 보고 5단계를 쭉 진행하고 끝난다. 되돌아가 대조할 방법이 없다.
여기서는 PDF를 직접 열어 쪽 번호를 확인하고, 초안을 쓴 뒤 원문과 맞춰보고, 틀린 데를
고칠 수 있다. 그러니 **그 여유를 실제로 써라.** 초안을 뽑고 끝내면 앱보다 나을 게 없다.

## 순서

### 1. 자료를 읽는다

PDF는 그냥 Read로 연다(쪽 범위를 나눠 읽어도 된다). 스캔본이면 이미지로 읽힌다.
읽으면서 **쪽 번호를 기억해둔다** — 뒤에서 `sourceSpan` 에 쓴다.

분량을 먼저 가늠한다. 뒤에 나오는 모듈·카드 개수가 전부 여기에 비례한다.

### 2. 과목 어댑터를 정한다

`adapters/` 를 먼저 본다. 과목 성격이 맞는 게 있으면 **재사용한다** — 어댑터는
탭 이름·카테고리·색·표기 규칙일 뿐이라, 같은 과목이면 공유하는 게 맞다.

맞는 게 없을 때만 새로 만든다. 스키마와 기존 어댑터 목록은
`references/adapters.md` 참고.

### 3. 원문을 섹션·문단으로 옮긴다 (`source`)

**여기서 요약하면 안 된다.** `original` 은 원문 그대로다. 앱의 "원문 읽기" 탭은
사용자가 원문과 직접 맞붙는 자리이고, 그게 이 탭의 존재 이유다. 요약본을 넣으면
사용자는 자기가 원문을 읽었다고 착각하게 된다.

쉬운 설명은 `assist`(쉬운 말 풀이/번역), 맥락은 `guide`(왜 중요한지 1~2문장)에 쓴다.
세 층이 각자 다른 일을 한다.

영어 논문이면 `original` 은 영어 그대로, `assist` 가 한국어 번역이 된다
(`research-paper` 어댑터의 `assistLabelDefault` 가 "한국어 번역"인 이유).

### 4. 학습 모듈을 짠다 (`modules`)

원문을 **다시 배열해** 이해 순서대로 만든다. 9개 블록 타입만 쓴다 —
`references/blocks.md` 에 각 타입의 필드와 언제 쓰는지가 있다.

**그림·도식·표로 정리하는 데 공을 들여라.** 이 앱의 학습법 0단계가 "그림부터 보고
추측하기"다 — 콘텐츠에 볼 그림이 없으면 1단계부터 빈손으로 시작하게 된다. 사람은
글보다 그림에서 구조를 먼저 잡고, 그렇게 잡은 뼈대가 있어야 나머지 글이 붙는다.

내용의 성격에 따라 형태를 고른다:

| 내용이 이런 성격이면 | 이 블록으로 | 왜 |
|---|---|---|
| 흐름·순환·구조 관계 (A→B→C, 되먹임 고리, 장치 구성) | `diagram` (SVG 직접 그림) | 글로 쓰면 읽는 사람이 머릿속에서 그림을 다시 조립해야 한다 |
| 3개 이상 항목 × 2개 이상 속성 비교 | `table` | 산문으로 늘어놓은 비교는 읽는 순간 잊힌다 |
| 외워야 할 숫자 모음 | `table` | 흩어진 숫자는 반복할 수가 없다. 한곳에 모아야 외워진다 |
| 원문에 있는 그림·도표 | `figureCard` | "이 그림이 무슨 뜻이냐"에 즉답할 수 있어야 한다 |
| 용어 여러 개의 정의 | `termGrid` | |
| 그 외 설명 | `prose` | |

`diagram` 은 **직접 SVG를 그리라는 뜻이다.** 원문 그림을 파일로 가져올 수 없으니
구조를 이해해서 다시 그려야 한다. 반응 순환 하나, 장치 흐름 하나라도 그려두면
그 모듈의 값어치가 달라진다. 그리는 요령은 `references/blocks.md` 참고.

원문에 그림이 여러 개면 **그림 전용 모듈을 따로 두는 것**도 좋다 —
`perca-ceas.json` 의 `m6` 가 그 예로, 그림 6개를 각각 한 줄 해설과 함께 묶었다.

형태를 고르는 기준은 **"이 내용이 이 형태일 때 더 빨리 이해되는가"** 하나다.

### 5. 카드를 만든다 (`cards`)

능동 회상용이다. 질문을 보고 답을 **떠올릴 수 있어야** 하므로, 답이 문단 하나면
너무 크다. 쪼개라.

- **개수는 분량에 비례**한다. 짧은 자료를 늘리려고 쥐어짜지 마라 — 안 외워도 될 걸
  외우게 만든다. 참고로 논문 한 편 66장, 교과서 한 단원 12장.
- **`priority`**: `core` 는 전체의 2할 안팎이 적당하다(perca: 66장 중 14장). 전부
  `core` 면 우선순위가 없는 것과 같다.
- **`conceptId` 는 빠짐없이 채운다.** 이 카드를 어느 모듈에서 뽑았는지는 만들 때
  이미 알고 있으니 공짜다. 이게 있어야 틀렸을 때 "📖 원문 보기"로 해당 모듈까지
  한 번에 돌아간다 — 앱의 출처 결속 기능이 통째로 여기 달려 있다.
  (기존 `perca-ceas.json` 은 이게 0/66이라 버튼이 안 뜬다. 같은 실수를 반복하지 마라.)

### 6. 학습법과 리허설을 쓴다 (`guide`, `output`)

`guide.steps` 는 5~6개. 순서는 **그림·개요 먼저 → 압축해 읽기 → 가리고 맞히기 →
카드 암기 → 예상문제 점검**. 사람은 글보다 그림에서 구조를 먼저 잡기 때문에 이 순서다.
각 단계에 `links` 로 해당 모듈을 걸어주면 바로 이동한다.

`output.mode` 는 `presentation`(발표) 또는 `exam`(시험). 사용자가 무엇을 준비하는지에
맞춘다. `segments[].script` 는 **실제로 소리 내어 읽을 문장**이고, `keywords` 는 대본을
가리고 암송할 때 보는 힌트다.

### 7. 원문과 대조한다

여기가 앱이 못 하는 부분이고, 이 스킬의 값어치다. 초안을 덮어두고 원문으로 돌아가서
**숫자·고유명사·반응식을 하나씩 맞춰본다.** 특히 카드의 답과 `equation` 블록.
틀린 게 나오면 고친다.

### 8. 검증 스크립트를 돌린다

```
powershell -NoProfile -ExecutionPolicy Bypass -File .claude/skills/study-guide-content/scripts/Validate-Content.ps1 -ContentId <id>
```

(이 PC에는 python·node가 없어서 PowerShell로 썼다. 스크립트를 고칠 일이 있으면
**UTF-8 BOM을 유지해야 한다** — Windows PowerShell 5.1은 BOM 없는 `.ps1` 을 시스템
코드페이지로 읽어서 한글이 깨지고 파싱이 실패한다.)

스키마 위반과 **상호 참조가 어긋난 곳**을 잡는다 — 카드가 없는 모듈을 가리킨다거나,
어댑터에 없는 카테고리를 쓴다거나, manifest에 빠졌다거나. 이런 건 앱에서 조용히
깨지거나 엉뚱하게 렌더링돼서 눈으로는 잘 안 보인다. 통과할 때까지 고친다.

## 지어내지 않기

`ingest.js` 가 모든 단계 프롬프트에 넣는 규칙이고, 여기서도 똑같이 지킨다.

1. **원문에 없는 사실·숫자·용어를 지어내지 않는다.** 모르면 비워두거나 생략한다.
2. **`original` 에 요약을 넣지 않는다.** 원문 그대로. 쉬운 설명은 `assist` 에.
3. **글자가 불확실하면 `[판독 불확실]`** 로 표시하고 추측하지 않는다(스캔본·손글씨).
4. **`sourceSpan` 을 지어내지 않는다.** 원문에 쪽 번호가 실제로 있을 때만 채운다.
   PDF를 직접 읽고 있으니 대개 채울 수 있다 — 그게 이 스킬의 이점이다. 다만 없는
   근거를 만들어내느니 `{"page": null, "line": null}` 로 두는 게 낫다.

이 규칙들이 까다로워 보여도 이유는 하나다. 이건 **시험 전날 믿고 보는 자료**다.
그럴듯한데 틀린 숫자 하나가 공부 안 한 것보다 나쁘다.

## 참고 문서

- `references/content-schema.md` — 콘텐츠 JSON 전체 구조와 필드별 의미
- `references/blocks.md` — 9개 블록 타입의 필드와 선택 기준
- `references/adapters.md` — 어댑터 스키마, 기존 어댑터 목록, 색·표기 규칙

기존 콘텐츠 두 개가 가장 좋은 예시다. 논문은 `content/perca-ceas.json`,
교과서는 `content/sci-m2-state-change.json` 을 열어보면 결이 바로 잡힌다.
