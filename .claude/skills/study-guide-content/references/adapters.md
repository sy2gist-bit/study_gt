# 과목 어댑터

어댑터는 **콘텐츠가 아니라 표현 설정**이다 — 탭 이름, 카테고리와 색, 표기 규칙.
같은 과목이면 여러 콘텐츠가 하나를 공유한다. 새 콘텐츠를 만들 때 **먼저 재사용을
검토하고**, 과목 성격이 다를 때만 새로 만든다.

## 기존 어댑터

| id | label | 성격 | `assistLabelDefault` | `outputMode` |
|---|---|---|---|---|
| `research-paper` | 논문 리뷰 | 영어 논문, 발표 준비 | 한국어 번역 | presentation |
| `science-middle` | 중등 과학 | 교과서, 시험 대비 | 쉬운 말 풀이 | exam |

영어 논문을 읽고 발표한다 → `research-paper` 를 그대로 쓴다.
중고등 교과서로 시험 본다 → `science-middle` 을 그대로 쓴다.
그 외(예: 중등 사회, 법학 판례, 자격증 문제집)는 새로 만든다.

## 스키마

```json
{
  "id": "research-paper",
  "label": "논문 리뷰",

  "tabLabels": {
    "guide": "학습법", "read": "원문 읽기", "study": "학습자료",
    "cards": "카드 암기", "output": "발표 리허설"
  },
  "stageTags": ["0단계", "1단계", "2단계", "3단계", "4단계"],

  "assistLabelDefault": "한국어 번역",

  "cardCategories": [
    { "id": "concept", "label": "원리",       "color": "blue" },
    { "id": "number",  "label": "숫자",       "color": "orange" },
    { "id": "term",    "label": "용어·반응식", "color": "blue" }
  ],

  "moduleCategories": [
    { "id": "bg",   "color": "blue" },
    { "id": "flow", "color": "teal" }
  ],

  "notation": [
    { "pattern": "(?<![A-Za-z<])(NO2|CO2|H2O)(?![A-Za-z>])", "render": "chemical-subscript" }
  ],

  "outputMode": "presentation",
  "readingLevel": "expert"
}
```

### 필드별

- `id` — `adapters/<id>.json` 파일명과 일치. 콘텐츠의 `adapter` 필드가 이 값을 가리킨다.
- `tabLabels` — 5개 탭 이름. 과목 말투에 맞춘다("원문 읽기" vs "교과서 읽기").
  탭 **순서와 기능은 고정**이고 이름만 바뀐다.
- `stageTags` — 탭 옆 작은 배지 5개.
- `assistLabelDefault` — 원문 옆 보조 설명의 이름. 영어 자료면 "한국어 번역",
  한국어 자료면 "쉬운 말 풀이".
- `cardCategories` — 카드 필터 칩. 콘텐츠의 `cards[].category` 가 여기 `id` 중
  하나여야 한다. 4~6개가 적당하다 — 너무 잘게 나누면 필터가 쓸모없어진다.
- `moduleCategories` — 모듈 색 구분. `label` 없이 `id` 와 `color` 만.
  콘텐츠의 `modules[].category` 가 여기 `id` 중 하나여야 한다.
- `outputMode` — `"presentation"` 또는 `"exam"`. 콘텐츠의 `output.mode` 와 맞춘다.
- `readingLevel` — 문서용 메모(`expert`, `middle-2` 등). 렌더러는 쓰지 않는다.

### 색

`blue`, `orange`, `teal`, `red`, `gray` **다섯 개뿐이다.** 다른 값을 쓰면 회색으로
떨어진다. CSS가 어댑터에서 주입된 `--cat-color` 변수만 참조하도록 설계돼 있어서,
새 색을 쓰려면 `style.css` 를 고쳐야 하는데 그건 이 구조를 깨는 일이다.

쓰임새 관례: `red` 는 함정·주의, `orange` 는 숫자·수치, `teal` 은 실험·과정,
`blue` 는 개념·용어, `gray` 는 부차적인 것.

### 표기 규칙 (`notation`)

`render` 값 중 **실제로 동작하는 건 `chemical-subscript` 하나다.** 정규식에 걸린
문자열의 숫자를 `<sub>` 로 감싼다(`CO2` → CO₂).

```json
{ "pattern": "(?<![A-Za-z<])(H2O|CO2|O2|N2|NaCl|CO)(?![A-Za-z>])", "render": "chemical-subscript" }
```

앞뒤 `(?<![A-Za-z<])` / `(?![A-Za-z>])` 는 **긴 단어 안이나 HTML 태그 안에서 잘못
걸리는 걸 막는 장치**다. 새 화학식을 추가할 때도 이 틀을 유지한다.

LaTeX 등 다른 표기(`math-middle` 류)는 스키마 예시만 있고 구현되지 않았다.
수식은 `equation` 블록의 `expr` 에 일반 문자로 쓴다.

표기 규칙이 필요 없는 과목이면 `"notation": []` 로 둔다.
