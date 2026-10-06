# 콘텐츠 JSON 스키마

`content/<id>.json` 한 파일이 학습 콘텐츠 하나다. 최상위는 8개 키.

```json
{
  "schemaVersion": "1.0",
  "adapter": "<adapters/ 안의 어댑터 id>",
  "meta": { ... },
  "guide": { ... },
  "source": { ... },
  "modules": [ ... ],
  "cards": [ ... ],
  "output": { ... }
}
```

`adapter` 값은 `adapters/<값>.json` 이 실제로 있어야 한다. 없으면 앱이 로드에 실패한다.

---

## meta — 표지

```json
"meta": {
  "id": "perca-ceas",
  "eyebrow": "분석화학 · 대기측정",
  "title": "PERCA-CEAS 완전정복",
  "subtitle": "Tang et al. (2026), Atmos. Chem. Phys., 26, 11909–11921 — \"Measurement report: ...\"",
  "sourceRef": "Tang, Zheng, Wang, Liu, Chen & Wang (2026), Atmos. Chem. Phys., 26, 11909–11921",
  "oneLiner": "라디칼을 <b>화학적으로 증폭</b>시켜 광학으로 읽는다 — 그게 전부입니다.",
  "pills": ["발표 20분", "카드 66장", "예상질문 12개", "그림 6개"],
  "estimatedMinutes": 240,
  "targetDate": "2026-11-03"
}
```

- `id` — **파일명과 manifest 항목과 반드시 일치**. 짧은 kebab-case 를 쓴다.
- `title` — `textContent` 로 들어가므로 HTML 태그를 쓰지 않는다.
- `subtitle`, `oneLiner` — `innerHTML` 이라 `<b>` 같은 인라인 서식을 쓸 수 있다.
  `oneLiner` 는 "이 내용을 한 문장으로" 자리라, 핵심만 굵게 표시하면 좋다.
- `pills` — 상단 작은 배지 3~4개. 분량 감각을 주는 숫자가 유용하다.
- `targetDate` — 없으면 `null`.

## guide — 0단계 학습법

```json
"guide": {
  "headline": "...",
  "intro": "...",
  "steps": [
    { "n": 1, "title": "그림부터 보고 추측하기", "minutes": 30,
      "body": "텍스트는 아직 읽지 마세요. <b>4막 스토리라인</b>과 ...",
      "links": [ { "tab": "study", "anchor": "m3", "label": "→ 4막 스토리라인 보기" } ] }
  ],
  "closingCallout": "..."
}
```

- `steps` 는 5~6개. `minutes` 합이 `meta.estimatedMinutes` 와 어긋나지 않게 한다.
- `links[].tab` 은 `study` 또는 `read`. `anchor` 는 각각 **모듈 id** 또는
  **섹션/문단 id** 여야 한다 — 없는 id를 가리키면 눌러도 아무 일이 안 일어난다.
- `intro`, `body`, `closingCallout` 은 innerHTML.

## source — 원문 읽기 탭

```json
"source": {
  "assistLabel": "한국어 번역",
  "assistToggleDefault": "shown",
  "sections": [
    { "id": "s1", "navLabel": "초록", "title": "Abstract — 초록",
      "paragraphs": [
        { "id": "s1-p1", "tag": "본문 ①",
          "original": "원문 그대로",
          "assist": "쉬운 말 풀이 또는 번역",
          "guide": "이 문단이 왜 중요한지 1~2문장",
          "sourceSpan": { "page": 14, "line": [3, 6] } }
      ] }
  ]
}
```

- `assistToggleDefault` — `"shown"` 이면 해설이 펼쳐진 채 시작, `"hidden"` 이면 접힌 채.
  원문을 먼저 스스로 읽히고 싶으면 `hidden`.
- `original` **요약 금지**. 이 탭이 원문과 맞붙는 자리다.
- `sourceSpan.line` 은 `[시작, 끝]` 배열이거나 `null`.
- 문단 `id` 는 전체에서 유일해야 한다(`s1-p1` 처럼 섹션 id를 접두사로).

## modules — 학습자료 탭

```json
"modules": [
  { "id": "m1", "category": "bg", "title": "왜 이 연구인가",
    "blocks": [ { "type": "prose", "text": "..." } ] }
]
```

- `id` 는 `m1`, `m2` … 형식. 화면에 숫자만 떼어 표시된다.
- `category` 는 **어댑터의 `moduleCategories` 에 있는 id** 여야 한다. 없으면 회색으로 떨어진다.
- `blocks` 는 `references/blocks.md` 의 9개 타입만.

## cards — 카드 암기 탭

```json
"cards": [
  { "id": "c1", "category": "concept", "priority": "core",
    "q": "물질의 상태를 결정하는 두 가지 요인은?",
    "a": "입자의 운동(빠르기)과 입자 사이의 인력 — 이 둘의 힘겨루기로 상태가 정해집니다.",
    "conceptId": "m1",
    "sourceSpan": { "page": 14, "line": [3, 6] } }
]
```

- `category` 는 **어댑터의 `cardCategories` 에 있는 id**.
- `priority` 는 `"core"` 또는 `"normal"`. `core` 가 먼저 나온다.
- `conceptId` 는 **모듈 id**. 이게 있어야 "📖 원문 보기"가 그 모듈로 이동한다.
  빠짐없이 채운다.
- `q`/`a` 는 innerHTML — 어댑터의 표기 규칙(화학식 아래첨자 등)도 여기 적용된다.

## output — 발표/시험 리허설 탭

```json
"output": {
  "mode": "presentation",
  "title": "20분 발표 리허설",
  "targetMinutes": 20,
  "segments": [
    { "time": "0:00", "title": "도입 — 왜 이 논문인가",
      "script": "소리 내어 읽을 문장.",
      "keywords": ["힌트 1", "힌트 2"] }
  ]
}
```

- `mode` — `"presentation"` 또는 `"exam"`.
- `time` 은 `"분:초"` 문자열. 그 구간에 **진입할** 목표 시각이다. 앱이 실제 경과와
  비교해 페이스를 알려준다.
- `script` 는 실제 대본, `keywords` 는 대본을 가리고 암송할 때 보는 힌트.
  둘 다 있어야 암송 모드가 쓸모 있다.
- `segments` 마지막 `time` 과 `targetMinutes` 가 맞아떨어지게 한다.

---

## manifest 한 줄

`content/manifest.json` 은 선택 화면이 읽는 목록이다. 빠뜨리면 파일이 있어도 안 뜬다.

```json
[
  { "id": "perca-ceas", "adapter": "research-paper" },
  { "id": "sci-m2-state-change", "adapter": "science-middle" }
]
```

## HTML 을 넣을 때

문자열 상당수가 `innerHTML` 로 들어간다(의도된 설계 — `<b>`, `<sub>`, `<svg>` 허용).
`blocks.js` 의 `sanitizeHtml()` 이 `<script>`·`on*` 핸들러·`javascript:` 를 걷어내므로
서식 태그와 도형은 그대로 쓰면 된다. 자세한 건 저장소 README의 "콘텐츠 HTML 처리" 참고.
